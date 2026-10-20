import { Router } from 'express';
import { permit } from '../auth.js';
import { confirmAdmin } from './auth.js';
import { calculateOrder, METHODS } from '../order-calculations.js';
import { assert, number, text, money, date, today, orderDto, sendCsv, has } from '../lib.js';
import { idOf, record } from './store.js';
export async function quoteOrder(store, body, user, session) {
  const customerId = number(body.customer_id, 'Customer', { integer: true, min: 1 });
  const customer = (await store.customerRows({ _id: customerId }, session))[0];
  assert(
    Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 100,
    'Add between 1 and 100 order items.',
  );
  const ids = body.items.map((item) =>
    number(item.product_id, 'Product', { integer: true, min: 1 }),
  );
  const products = new Map(
    (await store.all('products', { _id: { $in: ids } }, session)).map((p) => [p.id, p]),
  );
  return calculateOrder(
    { customer, config: await store.config(session), productFor: (id) => products.get(id) },
    body,
  );
}
export async function getOrder(store, id, user, session) {
  const row = (await store.orderRows({ _id: idOf(id) }, session))[0];
  assert(row, 'Order not found.', 404);
  row.items = await store.all('order_items', { order_id: row.id }, session);
  const result = orderDto(row, user);
  result.payments = (
    await store.withUserNames(
      await store.all('payments', { order_id: row.id }, session, { _id: -1 }),
      'recorded_by',
    )
  ).map((p) => ({ ...p, amount: p.amount / 100 }));
  return result;
}
export function orderRoutes(store) {
  const router = Router();
  const list = async (q, user) => {
    const search = String(q.search || '').toLowerCase();
    let filter = {};
    if (q.start || q.end) {
      filter.order_date = {};
      if (q.start) filter.order_date.$gte = date(String(q.start));
      if (q.end) filter.order_date.$lte = date(String(q.end));
    }
    const rows = await store.orderRows(filter);
    const matching = new Set();
    if (search)
      for (const item of await store.all('order_items'))
        if (
          item.product_name.toLowerCase().includes(search) ||
          item.sku.toLowerCase().includes(search)
        )
          matching.add(item.order_id);
    return rows
      .map((o) => orderDto(o, user))
      .filter(
        (o) =>
          (!search ||
            o.invoice.toLowerCase().includes(search) ||
            o.customer.business.toLowerCase().includes(search) ||
            matching.has(o.id)) &&
          (!q.status || q.status === (o.overdue ? 'overdue' : '') || q.status === o.status),
      );
  };
  router.get('/', permit('viewOrders'), async (req, res) =>
    res.json(await list(req.query, req.user)),
  );
  router.get('/export', permit('viewOrders'), async (req, res) =>
    sendCsv(res, 'orders', await list(req.query, req.user), [
      ['Invoice', 'invoice'],
      ['Customer', (o) => o.customer.business],
      ['Date', 'order_date'],
      ['Due date', 'due_date'],
      ['Tier', 'tier'],
      ['Subtotal', 'subtotal'],
      ['Discount %', 'discount_percent'],
      ['Discount', 'discount_amount'],
      ['Total', 'total'],
      ['Collected', 'paid'],
      ['Balance', 'balance'],
      ['Status', 'status'],
    ]),
  );
  router.post('/quote', permit('createOrders'), async (req, res) => {
    const q = await quoteOrder(store, req.body, req.user);
    for (const key of ['subtotal', 'discount_amount', 'total', 'initial_paid']) q[key] /= 100;
    q.items = q.items.map((i) => {
      const item = { ...i, unit_price: i.unit_price / 100, line_total: i.line_total / 100 };
      if (has(req.user, 'viewCosts')) item.unit_cost = i.unit_cost / 100;
      else delete item.unit_cost;
      return item;
    });
    res.json(q);
  });
  router.post('/', permit('createOrders'), async (req, res) => {
    const requestId = text(req.body.request_id, 'Request ID', { max: 100 }),
      requestKey = requestId ? req.user.id + ':' + requestId : null;
    const result = await store.transaction(async (s) => {
      await store.guard('order-creation', s);
      if (requestKey) {
        const old = await store.c('orders').findOne({ request_key: requestKey }, { session: s });
        if (old) return { id: old._id, reused: true };
      }
      const q = await quoteOrder(store, req.body, req.user, s);
      assert(
        !q.initial_paid || has(req.user, 'managePayments'),
        'Your account cannot record payments.',
        403,
      );
      const id = await store.next('orders', s),
        invoice = 'NA-' + String(id).padStart(6, '0');
      const snapshot = {
        business: q.customer.business,
        contact: q.customer.contact,
        phone: q.customer.phone,
        email: q.customer.email,
        address: q.customer.address,
      };
      await store.c('orders').insertOne(
        {
          _id: id,
          invoice,
          request_key: requestKey,
          customer_id: q.customer_id,
          customer_snapshot: snapshot,
          order_date: q.order_date,
          due_date: q.due_date,
          tier: q.tier,
          subtotal: q.subtotal,
          discount_percent: q.discount_percent,
          discount_amount: q.discount_amount,
          total: q.total,
          payment_method: q.payment_method,
          notes: q.notes,
          user_id: req.user.id,
          revision: 0,
          created_at: new Date().toISOString(),
        },
        { session: s },
      );
      for (const item of q.items) {
        const p = record(
          await store
            .c('products')
            .findOneAndUpdate(
              { _id: item.product_id, stock: { $gte: item.quantity } },
              { $inc: { stock: -item.quantity }, $set: { updated_at: new Date().toISOString() } },
              { returnDocument: 'after', session: s },
            ),
        );
        assert(p, `${item.product_name}: insufficient stock.`, 409);
        const { available, ...line } = item;
        await store.insert('order_items', { ...line, order_id: id }, s);
        await store.insert(
          'stock_movements',
          {
            product_id: p.id,
            quantity: -item.quantity,
            balance: p.stock,
            note: invoice,
            user_id: req.user.id,
          },
          s,
        );
        if (p.stock <= p.reorder_level)
          await store.notify(
            'stock',
            'Low stock',
            `${p.name}: ${p.stock} ${p.unit} remaining.`,
            '/inventory',
            'viewInventory',
            s,
          );
      }
      if (q.initial_paid)
        await store.insert(
          'payments',
          {
            order_id: id,
            amount: q.initial_paid,
            method: q.payment_method,
            reference: '',
            paid_date: q.order_date,
            user_id: req.user.id,
          },
          s,
        );
      await store.notify(
        'order',
        'New sales order',
        `${invoice} · ${q.customer.business}`,
        '/orders',
        'viewOrders',
        s,
      );
      await store.audit(req.user, 'order.created', invoice, s);
      return { id, reused: false };
    });
    res.status(result.reused ? 200 : 201).json(await getOrder(store, result.id, req.user));
  });
  router.get('/:id', permit('viewOrders'), async (req, res) =>
    res.json(await getOrder(store, req.params.id, req.user)),
  );
  router.post('/:id/payments', permit('managePayments'), async (req, res) => {
    const id = idOf(req.params.id),
      amount = money(req.body.amount, 'Payment');
    assert(amount > 0, 'Payment must be greater than zero.');
    const method = text(req.body.method, 'Payment method', { required: true });
    assert(METHODS.includes(method) && method !== 'Credit', 'Choose a payment method.');
    const paid_date = date(req.body.paid_date || today(), 'Payment date'),
      reference = text(req.body.reference, 'Reference', { max: 200 });
    await store.transaction(async (s) => {
      const lock = await store
        .c('orders')
        .updateOne({ _id: id }, { $inc: { revision: 1 } }, { session: s });
      assert(lock.matchedCount, 'Order not found.', 404);
      const o = (await store.orderRows({ _id: id }, s))[0];
      assert(paid_date >= o.order_date, 'Payment date must be on or after the order date.');
      assert(amount <= o.total - o.paid, 'Payment exceeds the remaining balance.');
      await store.insert(
        'payments',
        { order_id: id, amount, method, paid_date, reference, user_id: req.user.id },
        s,
      );
      await store.audit(req.user, 'payment.recorded', o.invoice, s);
      await store.notify(
        'payment',
        'Payment recorded',
        `${o.invoice} · Rs. ${(amount / 100).toFixed(2)}`,
        '/orders',
        'viewOrders',
        s,
      );
    });
    res.json(await getOrder(store, id, req.user));
  });
  router.delete('/:id', permit('deleteOrders'), async (req, res) => {
    await confirmAdmin(store, req.body.adminPassword);
    const id = idOf(req.params.id);
    await store.transaction(async (s) => {
      const o = record(
        await store
          .c('orders')
          .findOneAndUpdate(
            { _id: id },
            { $inc: { revision: 1 } },
            { returnDocument: 'after', session: s },
          ),
      );
      assert(o, 'Order not found.', 404);
      for (const item of await store.all('order_items', { order_id: id }, s)) {
        if (!item.product_id) continue;
        const p = record(
          await store
            .c('products')
            .findOneAndUpdate(
              { _id: item.product_id },
              { $inc: { stock: item.quantity }, $set: { updated_at: new Date().toISOString() } },
              { returnDocument: 'after', session: s },
            ),
        );
        if (p)
          await store.insert(
            'stock_movements',
            {
              product_id: p.id,
              quantity: item.quantity,
              balance: p.stock,
              note: 'Deleted ' + o.invoice,
              user_id: req.user.id,
            },
            s,
          );
      }
      for (const name of ['payments', 'order_items', 'reminder_drafts'])
        await store.c(name).deleteMany({ order_id: id }, { session: s });
      await store.c('orders').deleteOne({ _id: id }, { session: s });
      await store.audit(req.user, 'order.deleted', o.invoice, s);
    });
    res.json({ ok: true });
  });
  return router;
}
