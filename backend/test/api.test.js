import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db.js';
import { createApp } from '../src/app.js';
import { today, csv } from '../src/lib.js';
const PASSWORD = 'Testing-only-phrase-2026';
async function environment(t, { persistent = false, setupToken = '' } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'na-test-'));
  const file = persistent ? join(folder, 'test.sqlite') : ':memory:';
  const db = openDatabase(file);
  const oldToken = process.env.SETUP_TOKEN;
  process.env.SETUP_TOKEN = setupToken;
  const app = createApp(db);
  if (oldToken === undefined) delete process.env.SETUP_TOKEN;
  else process.env.SETUP_TOKEN = oldToken;
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.on('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    rmSync(folder, { recursive: true, force: true });
  });
  function client() {
    let cookie = '',
      csrf = '';
    return {
      async request(path, { method = 'GET', body, raw = false, noCsrf = false } = {}) {
        const response = await fetch(base + path, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(cookie ? { cookie } : {}),
            ...(!noCsrf && csrf ? { 'x-csrf-token': csrf } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const data = raw ? await response.text() : await response.json();
        if (data?.csrf) csrf = data.csrf;
        return { status: response.status, data };
      },
      get(path) {
        return this.request(path);
      },
      post(path, body) {
        return this.request(path, { method: 'POST', body });
      },
      put(path, body) {
        return this.request(path, { method: 'PUT', body });
      },
      delete(path, body) {
        return this.request(path, { method: 'DELETE', body });
      },
    };
  }
  const admin = client();
  if (setupToken) {
    assert.equal((await admin.post('/auth/setup', { password: PASSWORD })).status, 403);
    assert.equal(
      (await admin.post('/auth/setup', { password: PASSWORD, setupToken: 'incorrect-test-code' }))
        .status,
      403,
    );
  }
  const setup = await admin.post('/auth/setup', { password: PASSWORD, setupToken });
  assert.equal(setup.status, 200);
  return { db, server, file, admin, client };
}
async function fixtures(admin, { stock = 1000, price = 1000, cost = 600 } = {}) {
  const p = await admin.post('/products', {
    name: 'Test cinnamon',
    sku: 'TEST-CIN',
    barcode: 'TEST123456',
    category: 'Whole spices',
    size: '100 g',
    origin: 'Sri Lanka',
    stock,
    reorder_level: 5,
    cost,
    mrp: price,
    wholesale: 800,
    distributor: 720,
    markup: 20,
  });
  assert.equal(p.status, 201);
  const c = await admin.post('/customers', {
    business: 'Test trade account',
    contact: 'Test buyer',
    tier: 'mrp',
    terms_days: 14,
    credit_limit: 1000,
  });
  assert.equal(c.status, 201);
  return {
    product: p.data,
    customer: c.data,
    payload: {
      customer_id: c.data.id,
      items: [{ product_id: p.data.id, quantity: 5 }],
      order_date: today(),
      due_date: today(),
      tier: 'mrp',
      payment_method: 'Cash',
    },
  };
}

test('fresh database has only the three named users; setup and auth are enforced', async (t) => {
  const { db, admin, client } = await environment(t);
  assert.deepEqual(
    db
      .prepare('SELECT name FROM users ORDER BY id')
      .all()
      .map((u) => u.name),
    ['Naween Samaranayaka', 'Anura Gunasekara', 'Mangala Senarathna'],
  );
  for (const table of [
    'products',
    'customers',
    'orders',
    'payments',
    'notifications',
    'sync_logs',
    'activity',
    'stock_movements',
    'reminder_drafts',
  ])
    assert.equal(db.prepare('SELECT COUNT(*) n FROM ' + table).get().n, 0);
  assert.equal((await client().get('/products')).status, 401);
  assert.equal((await admin.post('/auth/setup', { password: PASSWORD })).status, 409);
  assert.equal(
    (await admin.request('/products', { method: 'POST', body: {}, noCsrf: true })).status,
    403,
  );
  assert.equal((await admin.post('/auth/logout', {})).status, 200);
  assert.equal((await admin.get('/auth/me')).status, 401);
  assert.equal(
    (await admin.post('/auth/login', { username: 'naween', password: 'wrong-password' })).status,
    401,
  );
  assert.equal(
    (await admin.post('/auth/login', { username: 'naween', password: PASSWORD })).status,
    200,
  );
});

test('all configured manual discount thresholds are calculated in integer cents', async (t) => {
  const { admin } = await environment(t);
  const { payload } = await fixtures(admin);
  for (const [threshold, percent] of [
    [5000, 2],
    [10000, 3],
    [20000, 4],
    [40000, 5],
    [50000, 7],
    [100000, 10],
  ]) {
    const response = await admin.post('/orders/quote', {
      ...payload,
      items: payload.items.map((i) => ({ ...i, quantity: threshold / 1000 })),
      discount_percent: percent,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.subtotal, threshold);
    assert.equal(response.data.discount_amount, (threshold * percent) / 100);
    assert.equal(response.data.total, (threshold * (100 - percent)) / 100);
    assert.equal(response.data.creditWarning, true);
  }
  assert.equal(
    (
      await admin.post('/orders/quote', {
        ...payload,
        items: payload.items.map((i) => ({ ...i, quantity: 4 })),
        discount_percent: 2,
      })
    ).status,
    400,
  );
  assert.equal(
    (await admin.post('/orders/quote', { ...payload, discount_percent: 10 })).status,
    400,
  );
  assert.equal(
    (await admin.post('/orders/quote', { ...payload, discount_percent: 1 })).status,
    400,
  );
});

test('orders deduct stock atomically, resist tampered totals, and retry idempotently', async (t) => {
  const { admin, db } = await environment(t);
  const { product, payload } = await fixtures(admin, { stock: 8 });
  const request = {
    ...payload,
    request_id: 'unique-client-request',
    discount_percent: 2,
    subtotal: 1,
    total: 1,
    initial_paid: 1000,
    items: payload.items.map((i) => ({ ...i, unit_price: 1 })),
  };
  const created = await admin.post('/orders', request);
  assert.equal(created.status, 201);
  assert.equal(created.data.total, 4900);
  assert.equal(created.data.paid, 1000);
  assert.equal(created.data.balance, 3900);
  assert.equal(created.data.items[0].unit_price, 1000);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(product.id).stock, 3);
  const retry = await admin.post('/orders', request);
  assert.equal(retry.status, 200);
  assert.equal(retry.data.id, created.data.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);
  assert.equal(
    (await admin.post('/orders', { ...payload, request_id: 'different-request' })).status,
    409,
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n, 1);
});

test('a failed multi-item order leaves all stock and business records unchanged', async (t) => {
  const { admin, db } = await environment(t);
  const { product, payload } = await fixtures(admin);
  const second = await admin.post('/products', {
    name: 'Test pepper',
    sku: 'TEST-PEP',
    stock: 1,
    mrp: 10,
    cost: 5,
  });
  const response = await admin.post('/orders', {
    ...payload,
    items: [
      { product_id: product.id, quantity: 5 },
      { product_id: second.data.id, quantity: 2 },
    ],
  });
  assert.equal(response.status, 409);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(product.id).stock, 1000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  assert.equal(
    (await admin.post('/orders', { ...payload, items: [payload.items[0], payload.items[0]] }))
      .status,
    400,
  );
  assert.equal(
    (await admin.post('/orders', { ...payload, items: [{ product_id: product.id, quantity: -1 }] }))
      .status,
    400,
  );
});

test('payments, customer balances, historical margins, deletion and stock restoration agree', async (t) => {
  const { admin, db } = await environment(t);
  const { product, customer, payload } = await fixtures(admin);
  const o = (await admin.post('/orders', { ...payload, discount_percent: 2, initial_paid: 900 }))
    .data;
  const invalid = await admin.post('/orders/' + o.id + '/payments', {
    amount: 4001,
    method: 'Cash',
    paid_date: today(),
  });
  assert.equal(invalid.status, 400);
  const paid = await admin.post('/orders/' + o.id + '/payments', {
    amount: 4000,
    method: 'Bank transfer',
    reference: 'Test receipt',
    paid_date: today(),
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.status, 'paid');
  assert.equal(paid.data.balance, 0);
  const c = await admin.get('/customers/' + customer.id);
  assert.equal(c.data.lifetime_spend, 4900);
  assert.equal(c.data.outstanding, 0);
  await admin.put('/products/' + product.id, { ...product, cost: 900, mrp: 1500 });
  const report = (await admin.get('/reports?start=' + today() + '&end=' + today())).data;
  assert.equal(report.summary.revenue, 4900);
  assert.equal(report.summary.cogs, 3000);
  assert.equal(report.summary.grossProfit, 1900);
  assert.equal(report.summary.collected, 4900);
  assert.equal(report.products[0].cost, 3000);
  assert.equal(
    (await admin.delete('/orders/' + o.id, { adminPassword: 'wrong-password' })).status,
    403,
  );
  assert.equal((await admin.delete('/orders/' + o.id, { adminPassword: PASSWORD })).status, 200);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(product.id).stock, 1000);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n, 0);
  assert.equal((await admin.get('/customers/' + customer.id)).data.lifetime_spend, 0);
  const next = await admin.post('/orders', payload);
  assert.notEqual(next.data.invoice, o.invoice);
});

test('stock adjustments require notes and never allow negative inventory', async (t) => {
  const { admin, db } = await environment(t);
  const { product } = await fixtures(admin, { stock: 3 });
  assert.equal(
    (await admin.post('/products/' + product.id + '/stock', { quantity: 2, note: '' })).status,
    400,
  );
  assert.equal(
    (await admin.post('/products/' + product.id + '/stock', { quantity: -4, note: 'Test loss' }))
      .status,
    400,
  );
  assert.equal(
    (await admin.post('/products/' + product.id + '/stock', { quantity: 0, note: 'Test zero' }))
      .status,
    400,
  );
  const result = await admin.post('/products/' + product.id + '/stock', {
    quantity: 7,
    note: 'Test receipt',
  });
  assert.equal(result.data.stock, 10);
  assert.equal(result.data.initial_stock, 3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_movements').get().n, 2);
  assert.equal((await admin.get('/products/lookup/TEST123456')).data.id, product.id);
});

test('role permissions hide costs and restrict writes; temporary passwords must change', async (t) => {
  const { admin, client } = await environment(t);
  await fixtures(admin);
  await admin.put('/users/3', {
    name: 'Mangala Senarathna',
    username: 'mangala',
    role: 'sales',
    active: true,
    password: PASSWORD,
  });
  const sales = client();
  const login = await sales.post('/auth/login', { username: 'mangala', password: PASSWORD });
  assert.equal(login.data.user.mustChangePassword, true);
  assert.equal((await sales.get('/products')).status, 403);
  assert.equal(
    (
      await sales.post('/auth/password', {
        currentPassword: PASSWORD,
        password: PASSWORD + '-personal',
      })
    ).status,
    200,
  );
  const catalog = await sales.get('/products');
  assert.equal(catalog.status, 200);
  assert.equal('cost' in catalog.data[0], false);
  assert.equal('markup' in catalog.data[0], false);
  assert.equal((await sales.post('/products', {})).status, 403);
  assert.equal((await sales.get('/users')).status, 403);
  assert.equal((await sales.get('/reports')).status, 403);
  const dashboard = (await sales.get('/dashboard')).data;
  assert.equal('cogs' in dashboard.summary, false);
  assert.equal('value' in dashboard.inventory, false);
});

test('settings validate price tiers and calculate multiplier prices on the server', async (t) => {
  const { admin } = await environment(t);
  const { payload } = await fixtures(admin);
  const original = (await admin.get('/settings')).data;
  assert.equal((await admin.put('/settings', { pricingTiers: [] })).status, 400);
  assert.equal(
    (
      await admin.put('/settings', {
        pricingTiers: [{ id: 'evil', name: 'Invalid', priceKey: 'cost', active: true }],
      })
    ).status,
    400,
  );
  const tiers = [
    ...original.pricingTiers,
    { id: 'trade_plus', name: 'Trade plus', priceKey: 'wholesale', multiplier: 1.1, active: true },
  ];
  assert.equal((await admin.put('/settings', { pricingTiers: tiers })).status, 200);
  const quote = await admin.post('/orders/quote', { ...payload, tier: 'trade_plus' });
  assert.equal(quote.data.items[0].unit_price, 880);
  assert.equal(quote.data.total, 4400);
  tiers[3].active = false;
  await admin.put('/settings', { pricingTiers: tiers });
  assert.equal((await admin.post('/orders/quote', { ...payload, tier: 'trade_plus' })).status, 400);
});

test('catalog deletion requires admin confirmation and protects invoice history', async (t) => {
  const { admin } = await environment(t);
  const { product, payload } = await fixtures(admin);
  assert.equal(
    (await admin.delete('/products/' + product.id, { adminPassword: 'wrong-password' })).status,
    403,
  );
  await admin.post('/orders', payload);
  assert.equal(
    (await admin.delete('/products/' + product.id, { adminPassword: PASSWORD })).status,
    409,
  );
  assert.equal((await admin.post('/products/reset', { adminPassword: PASSWORD })).status, 409);
  assert.equal(
    (
      await admin.put('/users/1', {
        name: 'Naween',
        username: 'naween',
        role: 'admin',
        active: false,
      })
    ).status,
    409,
  );
});

test('accounting exports and reminder drafts persist accurate non-delivery status', async (t) => {
  const { admin, db } = await environment(t);
  const { payload } = await fixtures(admin);
  const o = (await admin.post('/orders', payload)).data;
  const qb = await admin.get('/accounting/export/quickbooks');
  assert.equal(qb.data.invoices[0].TotalAmt, 5000);
  assert.match(qb.data.format, /not a live sync/);
  const xero = await admin.request('/accounting/export/xero', { raw: true });
  assert.equal(xero.status, 200);
  assert.match(xero.data, /AccountCode/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sync_logs').get().n, 2);
  const draft = await admin.post('/reminders/' + o.id + '/log', {
    channel: 'email',
    recipient: 'test@example.com',
    message: 'Test reminder draft',
  });
  assert.equal(draft.data.sent, false);
  assert.equal(
    db.prepare('SELECT message FROM reminder_drafts').get().message,
    'Test reminder draft',
  );
  assert.equal((await admin.get('/reminders/history')).data.length, 1);
});

test('SQLite data persists on reopen without reseeding deleted users or adding business data', async (t) => {
  const { admin, file } = await environment(t, { persistent: true });
  await fixtures(admin);
  const second = openDatabase(file);
  assert.equal(second.prepare('SELECT COUNT(*) n FROM products').get().n, 1);
  assert.equal(second.prepare('SELECT stock FROM products').get().stock, 1000);
  assert.equal(second.prepare('SELECT COUNT(*) n FROM customers').get().n, 1);
  assert.ok(
    second.prepare("SELECT password_hash FROM users WHERE username='naween'").get().password_hash,
  );
  second.close();
});

test('CSV exports neutralize spreadsheet formulas and escape quotes', () => {
  const result = csv(
    [{ name: '=HYPERLINK("bad")', sku: 'A,B' }],
    [
      ['Name', 'name'],
      ['SKU', 'sku'],
    ],
  );
  assert.match(result, /"'=HYPERLINK/);
  assert.match(result, /"A,B"/);
  assert.match(result, /""bad""/);
});

test('invalid amounts and date ranges are rejected without writing records', async (t) => {
  const { admin, db } = await environment(t);
  const { payload, product } = await fixtures(admin);
  assert.equal((await admin.post('/orders', { ...payload, initial_paid: 1.005 })).status, 400);
  assert.equal(
    (await admin.post('/orders', { ...payload, initial_paid: 10, payment_method: 'Credit' }))
      .status,
    400,
  );
  assert.equal(
    (
      await admin.post('/products/' + product.id + '/stock', {
        quantity: true,
        note: 'Invalid type',
      })
    ).status,
    400,
  );
  assert.equal((await admin.get('/reports?start=2026-10-31&end=2026-10-01')).status, 400);
  assert.equal((await admin.get('/accounting/export/xero?start=invalid')).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
});

test('public deployment setup requires the configured one-time code', async (t) => {
  const { admin, client } = await environment(t, { setupToken: 'test-only-bootstrap-code' });
  assert.equal((await client().get('/auth/status')).data.setupTokenRequired, true);
  assert.equal((await client().get('/auth/status')).data.setupRequired, false);
  assert.equal(
    (
      await client().post('/auth/setup', {
        password: PASSWORD,
        setupToken: 'test-only-bootstrap-code',
      })
    ).status,
    409,
  );
  assert.equal((await admin.get('/users')).status, 200);
});
