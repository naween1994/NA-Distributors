import { calculateOrder, METHODS } from '../order-calculations.js';
import { Router } from 'express';
import { permit, confirmAdmin } from '../auth.js';
import { settings, transaction, audit, notify } from '../db.js';
import {
  assert,
  number,
  text,
  money,
  date,
  today,
  orderDto,
  orderSelect,
  customerSelect,
  sendCsv,
  has,
} from '../lib.js';
export { METHODS };
export function quoteOrder(db, body, user) {
  const customer = db
    .prepare(customerSelect + ' WHERE c.id=?')
    .get(number(body.customer_id, 'Customer', { integer: true, min: 1 }));
  return calculateOrder(
    {
      customer,
      config: settings(db),
      productFor: (id) => db.prepare('SELECT * FROM products WHERE id=?').get(id),
    },
    body,
  );
}
export function orderRoutes(db) {
  const router = Router();
  const get = (id, user) => {
    const row = db.prepare(orderSelect + ' WHERE o.id=?').get(id);
    assert(row, 'Order not found.', 404);
    row.items = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
    const result = orderDto(row, user);
    result.payments = db
      .prepare(
        'SELECT p.*,u.name recorded_by FROM payments p LEFT JOIN users u ON u.id=p.user_id WHERE order_id=? ORDER BY p.id DESC',
      )
      .all(id)
      .map((p) => ({ ...p, amount: p.amount / 100 }));
    return result;
  };
  const list = (q, user) => {
    let rows = db.prepare(orderSelect + ' ORDER BY o.order_date DESC,o.id DESC').all();
    const search = String(q.search || '').toLowerCase();
    const matching = search
      ? new Set(
          db
            .prepare(
              'SELECT DISTINCT order_id FROM order_items WHERE lower(product_name) LIKE ? OR lower(sku) LIKE ?',
            )
            .all('%' + search + '%', '%' + search + '%')
            .map((x) => x.order_id),
        )
      : null;
    return rows
      .map((o) => orderDto(o, user))
      .filter(
        (o) =>
          (!search ||
            o.invoice.toLowerCase().includes(search) ||
            o.customer.business.toLowerCase().includes(search) ||
            matching.has(o.id)) &&
          (!q.status || q.status === (o.overdue ? 'overdue' : '') || q.status === o.status) &&
          (!q.start || o.order_date >= q.start) &&
          (!q.end || o.order_date <= q.end),
      );
  };
  router.get('/', permit('viewOrders'), (req, res) => res.json(list(req.query, req.user)));
  router.get('/export', permit('viewOrders'), (req, res) =>
    sendCsv(res, 'orders', list(req.query, req.user), [
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
  router.post('/quote', permit('createOrders'), (req, res) => {
    const quote = quoteOrder(db, req.body, req.user);
    for (const key of ['subtotal', 'discount_amount', 'total', 'initial_paid']) quote[key] /= 100;
    quote.items = quote.items.map((i) => {
      const result = { ...i, unit_price: i.unit_price / 100, line_total: i.line_total / 100 };
      if (has(req.user, 'viewCosts')) result.unit_cost = i.unit_cost / 100;
      else delete result.unit_cost;
      return result;
    });
    res.json(quote);
  });
  router.post('/', permit('createOrders'), (req, res) => {
    const requestId = text(req.body.request_id, 'Request ID', { max: 100 });
    const requestKey = requestId ? req.user.id + ':' + requestId : null;
    if (requestKey) {
      const existing = db.prepare('SELECT id FROM orders WHERE request_key=?').get(requestKey);
      if (existing) return res.json(get(existing.id, req.user));
    }
    const id = transaction(db, () => {
      const q = quoteOrder(db, req.body, req.user);
      assert(
        !q.initial_paid || has(req.user, 'managePayments'),
        'Your account cannot record payments.',
        403,
      );
      const snapshot = {
        business: q.customer.business,
        contact: q.customer.contact,
        phone: q.customer.phone,
        email: q.customer.email,
        address: q.customer.address,
      };
      const result = db
        .prepare(
          'INSERT INTO orders(request_key,customer_id,customer_snapshot,order_date,due_date,tier,subtotal,discount_percent,discount_amount,total,payment_method,notes,user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          requestKey,
          q.customer_id,
          JSON.stringify(snapshot),
          q.order_date,
          q.due_date,
          q.tier,
          q.subtotal,
          q.discount_percent,
          q.discount_amount,
          q.total,
          q.payment_method,
          q.notes,
          req.user.id,
        );
      const id = Number(result.lastInsertRowid);
      const invoice = 'NA-' + String(id).padStart(6, '0');
      db.prepare('UPDATE orders SET invoice=? WHERE id=?').run(invoice, id);
      for (const item of q.items) {
        db.prepare(
          'INSERT INTO order_items(order_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total) VALUES(?,?,?,?,?,?,?,?)',
        ).run(
          id,
          item.product_id,
          item.product_name,
          item.sku,
          item.quantity,
          item.unit_price,
          item.unit_cost,
          item.line_total,
        );
        db.prepare('UPDATE products SET stock=stock-?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
          item.quantity,
          item.product_id,
        );
        const p = db.prepare('SELECT * FROM products WHERE id=?').get(item.product_id);
        db.prepare(
          'INSERT INTO stock_movements(product_id,quantity,balance,note,user_id) VALUES(?,?,?,?,?)',
        ).run(item.product_id, -item.quantity, p.stock, invoice, req.user.id);
        if (p.stock <= p.reorder_level)
          notify(
            db,
            'stock',
            'Low stock',
            `${p.name}: ${p.stock} ${p.unit} remaining.`,
            '/inventory',
            'viewInventory',
          );
      }
      if (q.initial_paid)
        db.prepare(
          'INSERT INTO payments(order_id,amount,method,paid_date,user_id) VALUES(?,?,?,?,?)',
        ).run(id, q.initial_paid, q.payment_method, q.order_date, req.user.id);
      notify(
        db,
        'order',
        'New sales order',
        `${invoice} · ${q.customer.business}`,
        '/orders',
        'viewOrders',
      );
      audit(db, req.user, 'order.created', invoice);
      return id;
    });
    res.status(201).json(get(id, req.user));
  });
  router.get('/:id', permit('viewOrders'), (req, res) => res.json(get(req.params.id, req.user)));
  router.post('/:id/payments', permit('managePayments'), (req, res) => {
    const amount = money(req.body.amount, 'Payment');
    assert(amount > 0, 'Payment must be greater than zero.');
    const method = text(req.body.method, 'Payment method', { required: true });
    assert(METHODS.includes(method) && method !== 'Credit', 'Choose a payment method.');
    const paid_date = date(req.body.paid_date || today(), 'Payment date');
    const reference = text(req.body.reference, 'Reference', { max: 200 });
    transaction(db, () => {
      const order = db.prepare(orderSelect + ' WHERE o.id=?').get(req.params.id);
      assert(order, 'Order not found.', 404);
      assert(paid_date >= order.order_date, 'Payment date must be on or after the order date.');
      assert(amount <= order.total - order.paid, 'Payment exceeds the remaining balance.');
      db.prepare(
        'INSERT INTO payments(order_id,amount,method,reference,paid_date,user_id) VALUES(?,?,?,?,?,?)',
      ).run(order.id, amount, method, reference, paid_date, req.user.id);
      audit(db, req.user, 'payment.recorded', order.invoice);
      notify(
        db,
        'payment',
        'Payment recorded',
        `${order.invoice} · Rs. ${(amount / 100).toFixed(2)}`,
        '/orders',
        'viewOrders',
      );
    });
    res.json(get(req.params.id, req.user));
  });
  router.delete('/:id', permit('deleteOrders'), (req, res) => {
    confirmAdmin(db, req.body.adminPassword);
    transaction(db, () => {
      const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
      assert(order, 'Order not found.', 404);
      for (const item of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id)) {
        if (!item.product_id) continue;
        db.prepare('UPDATE products SET stock=stock+?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
          item.quantity,
          item.product_id,
        );
        const p = db.prepare('SELECT stock FROM products WHERE id=?').get(item.product_id);
        db.prepare(
          'INSERT INTO stock_movements(product_id,quantity,balance,note,user_id) VALUES(?,?,?,?,?)',
        ).run(item.product_id, item.quantity, p.stock, 'Deleted ' + order.invoice, req.user.id);
      }
      db.prepare('DELETE FROM orders WHERE id=?').run(order.id);
      audit(db, req.user, 'order.deleted', order.invoice);
    });
    res.json({ ok: true });
  });
  return router;
}
