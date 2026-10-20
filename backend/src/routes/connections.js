import { Router } from 'express';
import { date } from '../lib.js';
import { permit } from '../auth.js';
import { settings, audit, notify } from '../db.js';
import { assert, text, orderSelect, orderDto, today, sendCsv } from '../lib.js';
export function connectionRoutes(db) {
  const router = Router();
  router.get('/notifications', (req, res) => {
    if (req.user.permissions.includes('viewOrders')) {
      const due = db
        .prepare(orderSelect + ' WHERE o.due_date<?')
        .all(today())
        .filter((o) => o.total > o.paid);
      for (const o of due) {
        const message = `${o.invoice} has an overdue balance.`;
        if (
          !db
            .prepare("SELECT id FROM notifications WHERE type='reminder' AND message=?")
            .get(message)
        )
          notify(db, 'reminder', 'Payment overdue', message, '/reminders', 'viewOrders');
      }
    }
    res.json(
      db
        .prepare(
          'SELECT n.*,CASE WHEN r.user_id IS NOT NULL THEN 1 ELSE 0 END is_read FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=? ORDER BY n.id DESC LIMIT 200',
        )
        .all(req.user.id)
        .filter((n) => req.user.permissions.includes(n.permission)),
    );
  });
  router.post('/notifications/read', (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    assert(ids.length <= 200, 'Too many notifications.');
    const put = db.prepare(
      'INSERT OR IGNORE INTO notification_reads(notification_id,user_id) VALUES(?,?)',
    );
    for (const id of ids) {
      const n = db.prepare('SELECT * FROM notifications WHERE id=?').get(id);
      if (n && req.user.permissions.includes(n.permission)) put.run(n.id, req.user.id);
    }
    res.json({ ok: true });
  });
  router.get('/reminders', permit('viewOrders'), (req, res) =>
    res.json(
      db
        .prepare(orderSelect + ' ORDER BY o.due_date,o.id')
        .all()
        .filter((o) => o.total > o.paid)
        .map((o) => orderDto(o, req.user)),
    ),
  );
  router.get('/reminders/history', permit('viewOrders'), (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT r.*,o.invoice,u.name user_name FROM reminder_drafts r JOIN orders o ON o.id=r.order_id LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 100',
        )
        .all(),
    ),
  );
  router.post('/reminders/:id/log', permit('managePayments'), (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    assert(order, 'Order not found.', 404);
    const channel = text(req.body.channel, 'Channel');
    assert(['email', 'sms'].includes(channel), 'Choose email or SMS.');
    const message = text(req.body.message, 'Reminder message', { required: true, max: 5000 });
    const recipient = text(req.body.recipient, 'Recipient', { max: 200 });
    db.prepare(
      'INSERT INTO reminder_drafts(order_id,user_id,channel,recipient,message) VALUES(?,?,?,?,?)',
    ).run(order.id, req.user.id, channel, recipient, message);
    audit(
      db,
      req.user,
      'reminder.prepared',
      order.invoice + ' · ' + channel + ' draft only; not sent',
    );
    res.json({
      ok: true,
      sent: false,
      message:
        'Reminder draft recorded. No email or SMS provider is connected; send it using your own app.',
    });
  });
  router.get('/accounting/history', permit('accounting'), (req, res) =>
    res.json(
      db
        .prepare(
          'SELECT l.*,u.name user_name FROM sync_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 100',
        )
        .all(),
    ),
  );
  router.get('/accounting/export/:provider', permit('accounting'), (req, res) => {
    const provider = req.params.provider;
    assert(['quickbooks', 'xero'].includes(provider), 'Unknown accounting format.');
    const start = date(String(req.query.start || '0001-01-01'), 'Start date'),
      end = date(String(req.query.end || today()), 'End date');
    assert(start <= end, 'Start date must be on or before end date.');
    const orders = db
      .prepare(orderSelect + ' WHERE o.order_date>=? AND o.order_date<=? ORDER BY o.id')
      .all(start, end);
    db.prepare(
      'INSERT INTO sync_logs(provider,action,status,detail,user_id) VALUES(?,?,?,?,?)',
    ).run(
      provider,
      'file export',
      'exported',
      `${orders.length} invoices; no data sent to ${provider}`,
      req.user.id,
    );
    notify(
      db,
      'accounting',
      'Accounting export prepared',
      `${orders.length} invoices exported for ${provider}. No live sync.`,
      '/accounting',
      'accounting',
    );
    if (provider === 'quickbooks') {
      const data = orders.map((o) => ({
        DocNumber: o.invoice,
        TxnDate: o.order_date,
        DueDate: o.due_date,
        CustomerRef: { name: JSON.parse(o.customer_snapshot).business },
        CurrencyRef: { value: 'LKR' },
        TotalAmt: o.total / 100,
        Balance: (o.total - o.paid) / 100,
        Line: [
          ...db
            .prepare('SELECT * FROM order_items WHERE order_id=?')
            .all(o.id)
            .map((i) => ({
              Amount: i.line_total / 100,
              Description: i.product_name,
              DetailType: 'SalesItemLineDetail',
              SalesItemLineDetail: {
                ItemRef: { name: i.sku },
                Qty: i.quantity,
                UnitPrice: i.unit_price / 100,
              },
            })),
          ...(o.discount_amount
            ? [
                {
                  Amount: o.discount_amount / 100,
                  DetailType: 'DiscountLineDetail',
                  DiscountLineDetail: { PercentBased: true, DiscountPercent: o.discount_percent },
                },
              ]
            : []),
        ],
      }));
      res.attachment('quickbooks-style-invoices.json').json({
        format:
          'QuickBooks-style export; account, customer and item IDs must be mapped before import. This is not a live sync.',
        invoices: data,
      });
    } else {
      const rows = [];
      for (const o of orders) {
        const c = JSON.parse(o.customer_snapshot);
        for (const i of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id))
          rows.push({
            contact: c.business,
            email: c.email,
            invoice: o.invoice,
            date: o.order_date,
            due: o.due_date,
            sku: i.sku,
            description: i.product_name,
            qty: i.quantity,
            price: i.unit_price / 100,
            discount: o.discount_percent,
          });
      }
      sendCsv(res, 'xero-invoices', rows, [
        ['ContactName', 'contact'],
        ['EmailAddress', 'email'],
        ['InvoiceNumber', 'invoice'],
        ['InvoiceDate', 'date'],
        ['DueDate', 'due'],
        ['InventoryItemCode', 'sku'],
        ['Description', 'description'],
        ['Quantity', 'qty'],
        ['UnitAmount', 'price'],
        ['Discount', 'discount'],
        ['AccountCode', () => ''],
        ['TaxType', () => 'No Tax'],
        ['Currency', () => 'LKR'],
      ]);
    }
  });
  return router;
}
