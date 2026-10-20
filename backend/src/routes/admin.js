import { Router } from 'express';
import { permit, publicUser, hashPassword, checkPassword, confirmAdmin } from '../auth.js';
import {
  DEFAULT_SETTINGS,
  ROLE_PERMISSIONS,
  PERMISSIONS,
  settings,
  transaction,
  audit,
} from '../db.js';
import { assert, text, number } from '../lib.js';
export function adminRoutes(db) {
  const router = Router();
  router.get('/settings', (req, res) => res.json(settings(db)));
  function validateConfig(body) {
    const out = {};
    for (const key of [
      'appName',
      'businessAddress',
      'businessPhone',
      'businessEmail',
      'invoiceFooter',
      'reminderEmail',
      'reminderSms',
    ])
      if (key in body) out[key] = text(body[key], key, { required: key === 'appName', max: 2000 });
    if ('distributorMarkup' in body)
      out.distributorMarkup = number(body.distributorMarkup, 'Distributor markup', { max: 1000 });
    if (body.pricingTiers !== undefined) {
      assert(
        Array.isArray(body.pricingTiers) &&
          body.pricingTiers.length > 0 &&
          body.pricingTiers.length <= 20,
        'Keep between 1 and 20 pricing tiers.',
      );
      const ids = new Set();
      out.pricingTiers = body.pricingTiers.map((t) => {
        const id = text(t.id, 'Tier ID', { required: true, max: 40 });
        assert(
          /^[a-z][a-z0-9_-]*$/.test(id) && !ids.has(id),
          'Tier IDs must be unique and use lowercase letters, numbers, hyphens or underscores.',
        );
        ids.add(id);
        const priceKey = t.priceKey || id;
        assert(
          ['mrp', 'wholesale', 'distributor'].includes(priceKey),
          'Choose a valid price source.',
        );
        return {
          id,
          name: text(t.name, 'Tier name', { required: true, max: 80 }),
          priceKey,
          multiplier: number(t.multiplier ?? 1, 'Tier multiplier', { min: 0.01, max: 100 }),
          active: !!t.active,
        };
      });
      assert(
        out.pricingTiers.some((t) => t.active),
        'At least one pricing tier must remain active.',
      );
      const old = settings(db).pricingTiers;
      for (const t of old) {
        if (!ids.has(t.id))
          assert(
            !db.prepare('SELECT id FROM customers WHERE tier=? LIMIT 1').get(t.id),
            'A customer uses this tier. Deactivate it instead of removing it.',
          );
      }
    }
    if (body.paymentTerms !== undefined) {
      assert(
        Array.isArray(body.paymentTerms) &&
          body.paymentTerms.length > 0 &&
          body.paymentTerms.length <= 20,
        'Keep between 1 and 20 payment terms.',
      );
      out.paymentTerms = body.paymentTerms.map((t) => ({
        name: text(t.name, 'Term name', { required: true, max: 80 }),
        days: number(t.days, 'Term days', { integer: true, max: 365 }),
      }));
    }
    return out;
  }
  router.put('/settings', permit('manageSettings'), (req, res) => {
    const config = validateConfig(req.body);
    transaction(db, () => {
      const put = db.prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      );
      for (const [k, v] of Object.entries(config)) put.run(k, JSON.stringify(v));
      audit(db, req.user, 'settings.updated', Object.keys(config).join(', '));
    });
    res.json(settings(db));
  });
  router.post('/settings/reset', permit('manageSettings'), (req, res) => {
    confirmAdmin(db, req.body.adminPassword);
    const used = db.prepare('SELECT DISTINCT tier FROM customers').all();
    const old = settings(db);
    const defaults = structuredClone(DEFAULT_SETTINGS);
    for (const { tier } of used)
      if (!defaults.pricingTiers.some((t) => t.id === tier)) {
        const tierConfig = old.pricingTiers.find((t) => t.id === tier);
        if (tierConfig) defaults.pricingTiers.push({ ...tierConfig, active: false });
      }
    transaction(db, () => {
      const put = db.prepare('UPDATE settings SET value=? WHERE key=?');
      for (const [k, v] of Object.entries(defaults)) put.run(JSON.stringify(v), k);
      audit(db, req.user, 'settings.reset', 'Defaults restored; referenced custom tiers retained');
    });
    res.json(settings(db));
  });
  router.get('/users', permit('manageUsers'), (req, res) =>
    res.json({
      users: db.prepare('SELECT * FROM users ORDER BY id').all().map(publicUser),
      roles: ROLE_PERMISSIONS,
      permissions: PERMISSIONS,
    }),
  );
  function userValues(body) {
    const name = text(body.name, 'Full name', { required: true, max: 120 });
    const username = text(body.username, 'Username', { required: true, max: 80 });
    assert(
      /^[a-zA-Z0-9._-]+$/.test(username),
      'Username may contain letters, numbers, dots, underscores and hyphens.',
    );
    assert(Object.hasOwn(ROLE_PERMISSIONS, body.role), 'Choose a valid role.');
    let permissions = null;
    if (body.permissions !== null && body.permissions !== undefined) {
      assert(
        Array.isArray(body.permissions) && body.permissions.every((p) => PERMISSIONS.includes(p)),
        'Invalid permissions.',
      );
      permissions = JSON.stringify([...new Set(body.permissions)]);
    }
    return { name, username, role: body.role, permissions, active: body.active === false ? 0 : 1 };
  }
  router.post('/users', permit('manageUsers'), (req, res) => {
    const p = userValues(req.body);
    const password = hashPassword(checkPassword(req.body.password));
    const id = Number(
      db
        .prepare(
          'INSERT INTO users(name,username,role,permissions,active,password_hash,must_change_password) VALUES(?,?,?,?,?,?,1)',
        )
        .run(p.name, p.username, p.role, p.permissions, p.active, password).lastInsertRowid,
    );
    audit(db, req.user, 'user.created', p.username);
    res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)));
  });
  function protectLastAdmin(old, p) {
    if (
      old.role === 'admin' &&
      old.active &&
      old.password_hash &&
      (p.role !== 'admin' ||
        !p.active ||
        (p.permissions !== null && !JSON.parse(p.permissions).includes('manageUsers')))
    ) {
      const others = db
        .prepare(
          "SELECT * FROM users WHERE id<>? AND role='admin' AND active=1 AND password_hash IS NOT NULL",
        )
        .all(old.id)
        .filter((u) => !u.permissions || JSON.parse(u.permissions).includes('manageUsers'));
      assert(
        others.length,
        'Keep at least one active administrator with user management permission.',
        409,
      );
    }
  }
  router.put('/users/:id', permit('manageUsers'), (req, res) => {
    const old = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    assert(old, 'User not found.', 404);
    const p = userValues(req.body);
    protectLastAdmin(old, p);
    let password = null;
    if (req.body.password) password = hashPassword(checkPassword(req.body.password));
    transaction(db, () => {
      db.prepare('UPDATE users SET name=?,username=?,role=?,permissions=?,active=? WHERE id=?').run(
        p.name,
        p.username,
        p.role,
        p.permissions,
        p.active,
        old.id,
      );
      if (password)
        db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(
          password,
          old.id,
        );
      if (password || !p.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(old.id);
      audit(db, req.user, 'user.updated', p.username);
    });
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(old.id)));
  });
  router.delete('/users/:id', permit('manageUsers'), (req, res) => {
    confirmAdmin(db, req.body.adminPassword);
    const old = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    assert(old, 'User not found.', 404);
    assert(old.id !== req.user.id, 'You cannot delete the account you are signed in with.');
    protectLastAdmin(old, { role: old.role, active: 0 });
    db.prepare('DELETE FROM users WHERE id=?').run(old.id);
    audit(db, req.user, 'user.deleted', old.username);
    res.json({ ok: true });
  });
  router.get('/activity', permit('manageUsers'), (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT a.*,u.name user_name FROM activity a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100',
        )
        .all(),
    ),
  );
  return router;
}
