import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openMongoDatabase } from '../../src/mongo/store.js';
import { createApp } from '../../src/app.js';
import { today } from '../../src/lib.js';
const PASSWORD = 'Testing-only-phrase-2026';
const uri = process.env.MONGODB_TEST_URI;
if (!uri) throw new Error('Set MONGODB_TEST_URI to a disposable MongoDB replica set.');
async function environment(t) {
  const databaseName = 'na_test_' + randomUUID().replaceAll('-', '');
  let db = await openMongoDatabase(uri, { databaseName });
  let server, base;
  const start = async () => {
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.on('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port + '/api';
  };
  await start();
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.database.dropDatabase();
    await db.close();
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
  assert.equal((await admin.post('/auth/setup', { password: PASSWORD })).status, 200);
  return {
    get db() {
      return db;
    },
    admin,
    client,
    async restart() {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
      db = await openMongoDatabase(uri, { databaseName });
      await start();
    },
  };
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

test('MongoDB starts empty, enforces authentication, and keeps sessions and records after reconnect', async (t) => {
  const e = await environment(t);
  assert.equal(await e.db.c('users').countDocuments(), 3);
  for (const name of [
    'products',
    'customers',
    'orders',
    'payments',
    'notifications',
    'stock_movements',
    'activity',
  ])
    assert.equal(await e.db.c(name).countDocuments(), 0, name);
  assert.equal((await e.client().get('/products')).status, 401);
  assert.equal(
    (await e.admin.request('/products', { method: 'POST', body: {}, noCsrf: true })).status,
    403,
  );
  const { product } = await fixtures(e.admin);
  await e.restart();
  assert.equal((await e.admin.get('/auth/me')).status, 200);
  assert.equal((await e.admin.get('/products')).data[0].id, product.id);
  assert.equal(await e.db.c('users').countDocuments(), 3);
  assert.deepEqual((await e.client().get('/health')).data, {
    ok: true,
    database: 'mongodb',
    persistent: true,
  });
});
test('MongoDB uses every discount threshold, historical costs, payment totals and invoice protections', async (t) => {
  const { admin, db } = await environment(t);
  const { product, customer, payload } = await fixtures(admin);
  for (const [amount, percent] of [
    [5000, 2],
    [10000, 3],
    [20000, 4],
    [40000, 5],
    [50000, 7],
    [100000, 10],
  ]) {
    const quote = await admin.post('/orders/quote', {
      ...payload,
      items: [{ product_id: product.id, quantity: amount / 1000 }],
      discount_percent: percent,
    });
    assert.equal(quote.status, 200, JSON.stringify(quote.data));
    assert.equal(quote.data.total, (amount * (100 - percent)) / 100);
    assert.equal(quote.data.items[0].line_total, amount);
  }
  const order = await admin.post('/orders', {
    ...payload,
    discount_percent: 2,
    initial_paid: 1000,
    request_id: 'unique-request',
  });
  assert.equal(order.status, 201, JSON.stringify(order.data));
  assert.equal(order.data.total, 4900);
  assert.equal(order.data.paid, 1000);
  assert.equal((await db.get('products', product.id)).stock, 995);
  assert.equal(
    (await admin.post('/orders', { ...payload, request_id: 'unique-request' })).status,
    200,
  );
  assert.equal(await db.c('orders').countDocuments(), 1);
  const id = order.data.id;
  assert.equal((await admin.put('/products/' + product.id, { cost: 900 })).status, 200);
  assert.equal((await admin.get('/reports')).data.summary.cogs, 3000);
  assert.equal((await admin.get('/reports')).data.summary.grossProfit, 1900);
  assert.equal((await admin.get('/customers/' + customer.id)).data.outstanding, 3900);
  assert.equal(
    (await admin.delete('/products/' + product.id, { adminPassword: PASSWORD })).status,
    409,
  );
  assert.equal((await admin.post('/products/reset', { adminPassword: PASSWORD })).status, 409);
  assert.equal((await admin.delete('/orders/' + id, { adminPassword: 'incorrect' })).status, 403);
  assert.equal((await admin.delete('/orders/' + id, { adminPassword: PASSWORD })).status, 200);
  assert.equal((await db.get('products', product.id)).stock, 1000);
  assert.equal(await db.c('payments').countDocuments(), 0);
  const next = await admin.post('/orders', payload);
  assert.notEqual(next.data.invoice, order.data.invoice);
});
test('MongoDB concurrent orders cannot oversell and rejected orders have no partial writes', async (t) => {
  const { admin, db } = await environment(t);
  const { product, payload } = await fixtures(admin, { stock: 5 });
  const responses = await Promise.all([
    admin.post('/orders', payload),
    admin.post('/orders', payload),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await db.get('products', product.id)).stock, 0);
  assert.equal(await db.c('orders').countDocuments(), 1);
  assert.equal(await db.c('order_items').countDocuments(), 1);
  assert.equal(await db.c('stock_movements').countDocuments(), 2);
  assert.equal(await db.c('activity').countDocuments({ action: 'order.created' }), 1);
  const q = await admin.post('/products/' + product.id + '/stock', {
    quantity: -1,
    note: 'invalid',
  });
  assert.equal(q.status, 400);
  assert.equal((await db.get('products', product.id)).stock, 0);
});
test('MongoDB concurrent payments cannot exceed the balance', async (t) => {
  const { admin, db } = await environment(t);
  const { payload } = await fixtures(admin);
  const order = await admin.post('/orders', payload);
  const path = '/orders/' + order.data.id + '/payments';
  const responses = await Promise.all([
    admin.post(path, { amount: 3000, method: 'Cash' }),
    admin.post(path, { amount: 3000, method: 'Cash' }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
  assert.equal(await db.c('payments').countDocuments(), 1);
  assert.equal((await admin.get('/orders/' + order.data.id)).data.balance, 2000);
});
test('MongoDB permissions, cost hiding, unique indexes and password changes are enforced', async (t) => {
  const { admin, client } = await environment(t);
  const { product, payload } = await fixtures(admin);
  assert.equal(
    (await admin.post('/products', { name: 'Duplicate', sku: product.sku.toLowerCase() })).status,
    409,
  );
  assert.equal(
    (
      await admin.post('/products', {
        name: 'Duplicate barcode',
        sku: 'OTHER',
        barcode: product.barcode,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await admin.put('/users/3', {
        name: 'Mangala Senarathna',
        username: 'mangala',
        role: 'sales',
        password: PASSWORD,
      })
    ).status,
    200,
  );
  const sales = client();
  assert.equal(
    (await sales.post('/auth/login', { username: 'MANGALA', password: PASSWORD })).status,
    200,
  );
  assert.equal(
    (
      await sales.post('/auth/password', {
        currentPassword: PASSWORD,
        password: PASSWORD + '-changed',
      })
    ).status,
    200,
  );
  assert.equal('cost' in (await sales.get('/products')).data[0], false);
  assert.equal((await sales.get('/users')).status, 403);
  const order = await sales.post('/orders', payload);
  assert.equal(order.status, 201, JSON.stringify(order.data));
  assert.equal('unit_cost' in order.data.items[0], false);
  assert.equal(
    (await admin.put('/users/1', { name: 'Naween', username: 'naween', role: 'sales' })).status,
    409,
  );
});
test('MongoDB settings, barcode lookup, stock ledger, exports, notifications and reminder drafts persist', async (t) => {
  const { admin } = await environment(t);
  const { product, customer, payload } = await fixtures(admin);
  assert.equal(
    (await admin.put('/settings', { appName: 'NA Distributors', distributorMarkup: 30 })).status,
    200,
  );
  assert.equal((await admin.get('/settings')).data.distributorMarkup, 30);
  assert.equal((await admin.get('/products/lookup/' + product.barcode)).data.id, product.id);
  assert.equal(
    (await admin.post('/products/' + product.id + '/stock', { quantity: 4, note: 'Delivery' }))
      .status,
    200,
  );
  assert.equal((await admin.get('/products/' + product.id + '/movements')).data.length, 2);
  const order = await admin.post('/orders', payload);
  assert.equal((await admin.get('/customers/' + customer.id)).data.order_count, 1);
  for (const path of [
    '/products/export',
    '/customers/export',
    '/orders/export',
    '/reports/export',
    '/accounting/export/xero',
  ]) {
    const result = await admin.request(path, { raw: true });
    assert.equal(result.status, 200, path);
    assert.ok(result.data.includes(','), path);
  }
  const qb = await admin.get('/accounting/export/quickbooks');
  assert.equal(qb.data.invoices[0].DocNumber, order.data.invoice);
  assert.equal((await admin.get('/accounting/history')).data.length, 2);
  const reminder = await admin.post('/reminders/' + order.data.id + '/log', {
    channel: 'sms',
    message: 'Please pay',
    recipient: 'test',
  });
  assert.equal(reminder.data.sent, false);
  assert.equal((await admin.get('/reminders/history')).data.length, 1);
  const notifications = (await admin.get('/notifications')).data;
  assert.ok(notifications.length);
  assert.equal(
    (await admin.post('/notifications/read', { ids: notifications.map((n) => n.id) })).status,
    200,
  );
  assert.ok((await admin.get('/notifications')).data.every((n) => n.is_read));
  assert.equal((await admin.get('/dashboard')).data.summary.revenue, 5000);
});

test('MongoDB rolls back every order write if a later transaction step fails', async (t) => {
  const { admin, db } = await environment(t);
  const { product, payload } = await fixtures(admin);
  const audit = db.audit.bind(db);
  db.audit = async (user, action, detail, session) => {
    if (action === 'order.created') throw new Error('Injected transaction failure');
    return audit(user, action, detail, session);
  };
  t.mock.method(console, 'error', () => {});
  assert.equal((await admin.post('/orders', { ...payload, initial_paid: 1000 })).status, 500);
  db.audit = audit;
  for (const name of ['orders', 'order_items', 'payments', 'notifications'])
    assert.equal(await db.c(name).countDocuments(), 0, name);
  assert.equal((await db.get('products', product.id)).stock, 1000);
  assert.equal(await db.c('stock_movements').countDocuments(), 1);
  const responses = await Promise.all(
    [1, 2].map(() => admin.post('/orders', { ...payload, request_id: 'simultaneous-retry' })),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(responses[0].data.id, responses[1].data.id);
  assert.equal((await db.get('products', product.id)).stock, 995);
});
