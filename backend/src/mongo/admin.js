import { Router } from 'express';
import { permit, publicUser, hashPassword, checkPassword } from '../auth.js';
import { confirmAdmin } from './auth.js';
import { DEFAULT_SETTINGS, ROLE_PERMISSIONS, PERMISSIONS } from '../db.js';
import { assert, text, number } from '../lib.js';
import { idOf } from './store.js';
export function adminRoutes(store) {
  const router = Router();
  router.get('/settings', async (req, res) => res.json(await store.config()));
  async function validateConfig(body, session) {
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
      const old = await store.config(session);
      for (const t of old.pricingTiers)
        if (!ids.has(t.id))
          assert(
            !(await store.c('customers').findOne({ tier: t.id }, { session })),
            'A customer uses this tier. Deactivate it instead of removing it.',
          );
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
  router.put('/settings', permit('manageSettings'), async (req, res) => {
    await store.transaction(async (s) => {
      await store.guard('configuration', s);
      const config = await validateConfig(req.body, s);
      for (const [key, value] of Object.entries(config))
        await store
          .c('settings')
          .updateOne({ _id: key }, { $set: { value } }, { upsert: true, session: s });
      await store.audit(req.user, 'settings.updated', Object.keys(config).join(', '), s);
    });
    res.json(await store.config());
  });
  router.post('/settings/reset', permit('manageSettings'), async (req, res) => {
    await confirmAdmin(store, req.body.adminPassword);
    await store.transaction(async (s) => {
      await store.guard('configuration', s);
      const old = await store.config(s),
        defaults = structuredClone(DEFAULT_SETTINGS),
        used = await store.c('customers').distinct('tier', {}, { session: s });
      for (const tier of used)
        if (!defaults.pricingTiers.some((t) => t.id === tier)) {
          const t = old.pricingTiers.find((t) => t.id === tier);
          if (t) defaults.pricingTiers.push({ ...t, active: false });
        }
      for (const [key, value] of Object.entries(defaults))
        await store
          .c('settings')
          .updateOne({ _id: key }, { $set: { value } }, { upsert: true, session: s });
      await store.audit(
        req.user,
        'settings.reset',
        'Defaults restored; referenced custom tiers retained',
        s,
      );
    });
    res.json(await store.config());
  });
  router.get('/users', permit('manageUsers'), async (req, res) =>
    res.json({
      users: (await store.all('users')).map(publicUser),
      roles: ROLE_PERMISSIONS,
      permissions: PERMISSIONS,
    }),
  );
  function userValues(body) {
    const name = text(body.name, 'Full name', { required: true, max: 120 }),
      username = text(body.username, 'Username', { required: true, max: 80 });
    assert(
      /^[a-zA-Z0-9._-]+$/.test(username),
      'Username may contain letters, numbers, dots, underscores and hyphens.',
    );
    assert(Object.hasOwn(ROLE_PERMISSIONS, body.role), 'Choose a valid role.');
    let permissions = null;
    if (body.permissions !== undefined && body.permissions !== null) {
      assert(
        Array.isArray(body.permissions) && body.permissions.every((p) => PERMISSIONS.includes(p)),
        'Invalid permissions.',
      );
      permissions = [...new Set(body.permissions)];
    }
    return { name, username, role: body.role, permissions, active: body.active === false ? 0 : 1 };
  }
  async function protectLastAdmin(old, p, s) {
    if (
      old.role === 'admin' &&
      old.active &&
      old.password_hash &&
      (p.role !== 'admin' || !p.active || (p.permissions && !p.permissions.includes('manageUsers')))
    ) {
      const others = (
        await store.all(
          'users',
          { _id: { $ne: old.id }, role: 'admin', active: 1, password_hash: { $type: 'string' } },
          s,
        )
      ).filter((u) => !u.permissions || u.permissions.includes('manageUsers'));
      assert(
        others.length,
        'Keep at least one active administrator with user management permission.',
        409,
      );
    }
  }
  router.post('/users', permit('manageUsers'), async (req, res) => {
    const p = userValues(req.body),
      password_hash = hashPassword(checkPassword(req.body.password));
    const row = await store.transaction(async (s) => {
      await store.guard('admin-access', s);
      const user = await store.insert('users', { ...p, password_hash, must_change_password: 1 }, s);
      await store.audit(req.user, 'user.created', p.username, s);
      return user;
    });
    res.status(201).json(publicUser(row));
  });
  router.put('/users/:id', permit('manageUsers'), async (req, res) => {
    const id = idOf(req.params.id),
      p = userValues(req.body),
      password = req.body.password ? hashPassword(checkPassword(req.body.password)) : null;
    const row = await store.transaction(async (s) => {
      await store.guard('admin-access', s);
      const old = await store.get('users', id, s);
      assert(old, 'User not found.', 404);
      await protectLastAdmin(old, p, s);
      await store.c('users').updateOne(
        { _id: id },
        {
          $set: {
            ...p,
            ...(password ? { password_hash: password, must_change_password: 1 } : {}),
          },
        },
        { session: s },
      );
      if (password || !p.active)
        await store.c('sessions').deleteMany({ user_id: id }, { session: s });
      await store.audit(req.user, 'user.updated', p.username, s);
      return store.get('users', id, s);
    });
    res.json(publicUser(row));
  });
  router.delete('/users/:id', permit('manageUsers'), async (req, res) => {
    await confirmAdmin(store, req.body.adminPassword);
    const id = idOf(req.params.id);
    await store.transaction(async (s) => {
      await store.guard('admin-access', s);
      const old = await store.get('users', id, s);
      assert(old, 'User not found.', 404);
      assert(id !== req.user.id, 'You cannot delete the account you are signed in with.');
      await protectLastAdmin(old, { role: old.role, active: 0 }, s);
      await store.c('users').deleteOne({ _id: id }, { session: s });
      await store.c('sessions').deleteMany({ user_id: id }, { session: s });
      await store.c('notification_reads').deleteMany({ user_id: id }, { session: s });
      for (const name of [
        'orders',
        'payments',
        'stock_movements',
        'notifications',
        'activity',
        'sync_logs',
        'reminder_drafts',
      ])
        await store
          .c(name)
          .updateMany({ user_id: id }, { $set: { user_id: null } }, { session: s });
      await store.audit(req.user, 'user.deleted', old.username, s);
    });
    res.json({ ok: true });
  });
  router.get('/activity', permit('manageUsers'), async (req, res) =>
    res.json(
      await store.withUserNames(
        (await store.all('activity', {}, undefined, { _id: -1 })).slice(0, 100),
      ),
    ),
  );
  return router;
}
