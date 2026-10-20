import { Router } from 'express';
import { permit } from '../auth.js';
import { settings, audit } from '../db.js';
import {
  assert,
  text,
  number,
  money,
  customerDto,
  customerSelect,
  orderSelect,
  orderDto,
  sendCsv,
} from '../lib.js';
export function customerRoutes(db) {
  const router = Router();
  router.use(permit('viewCustomers'));
  const list = (q) => {
    const search = String(q.search || '').toLowerCase();
    return db
      .prepare(customerSelect + ' ORDER BY c.business COLLATE NOCASE')
      .all()
      .filter(
        (c) =>
          (!search ||
            [c.business, c.contact, c.phone, c.email, c.reference].some((v) =>
              v.toLowerCase().includes(search),
            )) &&
          (!q.tier || c.tier === q.tier),
      )
      .map(customerDto);
  };
  router.get('/', (req, res) => res.json(list(req.query)));
  router.get('/export', (req, res) =>
    sendCsv(res, 'customers', list(req.query), [
      ['Business', 'business'],
      ['Contact', 'contact'],
      ['Phone', 'phone'],
      ['Email', 'email'],
      ['Address', 'address'],
      ['Tier', 'tier'],
      ['Payment terms (days)', 'terms_days'],
      ['Credit limit', 'credit_limit'],
      ['Reference', 'reference'],
      ['Notes', 'notes'],
      ['Latitude', 'latitude'],
      ['Longitude', 'longitude'],
      ['Orders', 'order_count'],
      ['Lifetime spend', 'lifetime_spend'],
      ['Outstanding', 'outstanding'],
    ]),
  );
  router.get('/:id', (req, res) => {
    const row = db.prepare(customerSelect + ' WHERE c.id=?').get(req.params.id);
    assert(row, 'Customer not found.', 404);
    res.json({
      ...customerDto(row),
      orders: db
        .prepare(orderSelect + ' WHERE o.customer_id=? ORDER BY o.id DESC')
        .all(row.id)
        .map((o) => orderDto(o, req.user)),
    });
  });
  function fields(body) {
    const p = {};
    for (const k of ['business', 'contact', 'phone', 'email', 'address', 'reference', 'notes'])
      p[k] = text(body[k], k, {
        required: k === 'business',
        max: k === 'notes' || k === 'address' ? 2000 : 200,
      });
    assert(!p.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email), 'Enter a valid email address.');
    p.tier = text(body.tier || 'mrp', 'Pricing tier');
    assert(
      settings(db).pricingTiers.some((t) => t.id === p.tier),
      'Unknown pricing tier.',
    );
    p.terms_days = number(body.terms_days ?? 0, 'Payment terms', { integer: true, max: 365 });
    p.credit_limit = money(body.credit_limit ?? 0, 'Credit limit');
    p.latitude =
      body.latitude === '' || body.latitude == null
        ? null
        : number(body.latitude, 'Latitude', { min: -90, max: 90 });
    p.longitude =
      body.longitude === '' || body.longitude == null
        ? null
        : number(body.longitude, 'Longitude', { min: -180, max: 180 });
    assert(
      (p.latitude === null) === (p.longitude === null),
      'Provide both latitude and longitude.',
    );
    return p;
  }
  router.post('/', permit('manageCustomers'), (req, res) => {
    const p = fields(req.body);
    const id = Number(
      db
        .prepare(
          `INSERT INTO customers(${Object.keys(p).join(',')}) VALUES(${Object.keys(p)
            .map(() => '?')
            .join(',')})`,
        )
        .run(...Object.values(p)).lastInsertRowid,
    );
    audit(db, req.user, 'customer.created', p.business);
    res.status(201).json(customerDto(db.prepare(customerSelect + ' WHERE c.id=?').get(id)));
  });
  router.put('/:id', permit('manageCustomers'), (req, res) => {
    assert(
      db.prepare('SELECT id FROM customers WHERE id=?').get(req.params.id),
      'Customer not found.',
      404,
    );
    const p = fields(req.body);
    db.prepare(
      `UPDATE customers SET ${Object.keys(p)
        .map((k) => k + '=?')
        .join(',')} WHERE id=?`,
    ).run(...Object.values(p), req.params.id);
    audit(db, req.user, 'customer.updated', p.business);
    res.json(customerDto(db.prepare(customerSelect + ' WHERE c.id=?').get(req.params.id)));
  });
  return router;
}
