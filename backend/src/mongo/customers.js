import { Router } from 'express';
import { permit } from '../auth.js';
import { assert, text, number, money, customerDto, orderDto, sendCsv } from '../lib.js';
import { idOf } from './store.js';
export function customerRoutes(store) {
  const router = Router();
  router.use(permit('viewCustomers'));
  const list = async (q) => {
    const search = String(q.search || '').toLowerCase();
    return (await store.customerRows())
      .filter(
        (c) =>
          (!search ||
            [c.business, c.contact, c.phone, c.email, c.reference].some((v) =>
              v.toLowerCase().includes(search),
            )) &&
          (!q.tier || c.tier === q.tier),
      )
      .sort((a, b) => a.business.localeCompare(b.business))
      .map(customerDto);
  };
  router.get('/', async (req, res) => res.json(await list(req.query)));
  router.get('/export', async (req, res) =>
    sendCsv(res, 'customers', await list(req.query), [
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
  router.get('/:id', async (req, res) => {
    const rows = await store.customerRows({ _id: idOf(req.params.id) });
    assert(rows[0], 'Customer not found.', 404);
    res.json({
      ...customerDto(rows[0]),
      orders: (await store.orderRows({ customer_id: rows[0].id })).map((o) =>
        orderDto(o, req.user),
      ),
    });
  });
  async function fields(body, session) {
    const p = {};
    for (const k of ['business', 'contact', 'phone', 'email', 'address', 'reference', 'notes'])
      p[k] = text(body[k], k, {
        required: k === 'business',
        max: ['notes', 'address'].includes(k) ? 2000 : 200,
      });
    assert(!p.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email), 'Enter a valid email address.');
    p.tier = text(body.tier || 'mrp', 'Pricing tier');
    assert(
      (await store.config(session)).pricingTiers.some((t) => t.id === p.tier),
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
  router.post('/', permit('manageCustomers'), async (req, res) => {
    const row = await store.transaction(async (s) => {
      await store.guard('configuration', s);
      const p = await fields(req.body, s);
      const c = await store.insert('customers', p, s);
      await store.audit(req.user, 'customer.created', p.business, s);
      return c;
    });
    res.status(201).json(customerDto(row));
  });
  router.put('/:id', permit('manageCustomers'), async (req, res) => {
    const id = idOf(req.params.id);
    await store.transaction(async (s) => {
      await store.guard('configuration', s);
      const p = await fields(req.body, s);
      const r = await store.c('customers').updateOne({ _id: id }, { $set: p }, { session: s });
      assert(r.matchedCount, 'Customer not found.', 404);
      await store.audit(req.user, 'customer.updated', p.business, s);
    });
    res.json(customerDto((await store.customerRows({ _id: id }))[0]));
  });
  return router;
}
