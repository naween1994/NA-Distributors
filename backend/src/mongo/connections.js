import { Router } from 'express';
import { permit } from '../auth.js';
import { assert, text, date, today, orderDto, sendCsv } from '../lib.js';
import { idOf } from './store.js';
export function connectionRoutes(store) {
  const router = Router();
  router.get('/notifications', async (req, res) => {
    if (req.user.permissions.includes('viewOrders'))
      await store.transaction(async (s) => {
        await store.guard('payment-reminders', s);
        for (const o of await store.orderRows({ due_date: { $lt: today() } }, s)) {
          if (o.total <= o.paid) continue;
          const key = 'payment-due-' + o.id;
          if (!(await store.c('notifications').findOne({ dedupe_key: key }, { session: s })))
            await store.insert(
              'notifications',
              {
                type: 'reminder',
                title: 'Payment overdue',
                message: `${o.invoice} has an overdue balance.`,
                link: '/reminders',
                permission: 'viewOrders',
                dedupe_key: key,
              },
              s,
            );
        }
      });
    const rows = (
      await store.all('notifications', { permission: { $in: req.user.permissions } }, undefined, {
        _id: -1,
      })
    ).slice(0, 200);
    const read = new Set(
      (await store.c('notification_reads').find({ user_id: req.user.id }).toArray()).map(
        (r) => r.notification_id,
      ),
    );
    res.json(rows.map((n) => ({ ...n, is_read: read.has(n.id) ? 1 : 0 })));
  });
  router.post('/notifications/read', async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    assert(ids.length <= 200, 'Too many notifications.');
    for (const input of ids) {
      const id = idOf(input),
        n = await store.get('notifications', id);
      if (n && req.user.permissions.includes(n.permission))
        await store
          .c('notification_reads')
          .updateOne(
            { _id: req.user.id + ':' + id },
            { $setOnInsert: { notification_id: id, user_id: req.user.id } },
            { upsert: true },
          );
    }
    res.json({ ok: true });
  });
  router.get('/reminders', permit('viewOrders'), async (req, res) =>
    res.json(
      (await store.orderRows())
        .filter((o) => o.total > o.paid)
        .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id)
        .map((o) => orderDto(o, req.user)),
    ),
  );
  router.get('/reminders/history', permit('viewOrders'), async (req, res) => {
    const rows = (await store.all('reminder_drafts', {}, undefined, { _id: -1 })).slice(0, 100),
      orders = new Map(
        (await store.all('orders', { _id: { $in: rows.map((r) => r.order_id) } })).map((o) => [
          o.id,
          o,
        ]),
      );
    res.json(
      await store.withUserNames(
        rows
          .filter((r) => orders.has(r.order_id))
          .map((r) => ({ ...r, invoice: orders.get(r.order_id).invoice })),
      ),
    );
  });
  router.post('/reminders/:id/log', permit('managePayments'), async (req, res) => {
    const id = idOf(req.params.id),
      channel = text(req.body.channel, 'Channel');
    assert(['email', 'sms'].includes(channel), 'Choose email or SMS.');
    const message = text(req.body.message, 'Reminder message', { required: true, max: 5000 }),
      recipient = text(req.body.recipient, 'Recipient', { max: 200 });
    await store.transaction(async (s) => {
      const o = await store.get('orders', id, s);
      assert(o, 'Order not found.', 404);
      await store.c('orders').updateOne({ _id: id }, { $inc: { revision: 1 } }, { session: s });
      await store.insert(
        'reminder_drafts',
        { order_id: id, user_id: req.user.id, channel, recipient, message },
        s,
      );
      await store.audit(
        req.user,
        'reminder.prepared',
        o.invoice + ' · ' + channel + ' draft only; not sent',
        s,
      );
    });
    res.json({
      ok: true,
      sent: false,
      message:
        'Reminder draft recorded. No email or SMS provider is connected; send it using your own app.',
    });
  });
  router.get('/accounting/history', permit('accounting'), async (req, res) =>
    res.json(
      await store.withUserNames(
        (await store.all('sync_logs', {}, undefined, { _id: -1 })).slice(0, 100),
      ),
    ),
  );
  router.get('/accounting/export/:provider', permit('accounting'), async (req, res) => {
    const provider = req.params.provider;
    assert(['quickbooks', 'xero'].includes(provider), 'Unknown accounting format.');
    const start = date(String(req.query.start || '0001-01-01'), 'Start date'),
      end = date(String(req.query.end || today()), 'End date');
    assert(start <= end, 'Start date must be on or before end date.');
    const data = await store.transaction(async (s) => {
      const orders = (await store.orderRows({ order_date: { $gte: start, $lte: end } }, s)).sort(
        (a, b) => a.id - b.id,
      );
      const items = await store.all(
        'order_items',
        { order_id: { $in: orders.map((o) => o.id) } },
        s,
      );
      await store.insert(
        'sync_logs',
        {
          provider,
          action: 'file export',
          status: 'exported',
          detail: `${orders.length} invoices; no data sent to ${provider}`,
          user_id: req.user.id,
        },
        s,
      );
      await store.notify(
        'accounting',
        'Accounting export prepared',
        `${orders.length} invoices exported for ${provider}. No live sync.`,
        '/accounting',
        'accounting',
        s,
      );
      return { orders, items };
    });
    if (provider === 'quickbooks') {
      res.attachment('quickbooks-style-invoices.json').json({
        format:
          'QuickBooks-style export; account, customer and item IDs must be mapped before import. This is not a live sync.',
        invoices: data.orders.map((o) => ({
          DocNumber: o.invoice,
          TxnDate: o.order_date,
          DueDate: o.due_date,
          CustomerRef: { name: o.customer_snapshot.business },
          CurrencyRef: { value: 'LKR' },
          TotalAmt: o.total / 100,
          Balance: (o.total - o.paid) / 100,
          Line: [
            ...data.items
              .filter((i) => i.order_id === o.id)
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
                    DiscountLineDetail: {
                      PercentBased: true,
                      DiscountPercent: o.discount_percent,
                    },
                  },
                ]
              : []),
          ],
        })),
      });
    } else {
      const rows = [];
      for (const o of data.orders)
        for (const i of data.items.filter((i) => i.order_id === o.id))
          rows.push({
            contact: o.customer_snapshot.business,
            email: o.customer_snapshot.email,
            invoice: o.invoice,
            date: o.order_date,
            due: o.due_date,
            sku: i.sku,
            description: i.product_name,
            qty: i.quantity,
            price: i.unit_price / 100,
            discount: o.discount_percent,
          });
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
