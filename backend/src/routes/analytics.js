import { summarizeOrders } from '../report-calculations.js';
import { Router } from 'express';
import { assert } from '../lib.js';
import { permit } from '../auth.js';
import { orderSelect, orderDto, today, date, sendCsv, has } from '../lib.js';
export function analytics(db, start, end) {
  const orders = db
    .prepare(orderSelect + ' WHERE o.order_date>=? AND o.order_date<=? ORDER BY o.order_date,o.id')
    .all(start, end)
    .map((o) => ({
      ...o,
      items: db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(o.id),
    }));
  const collected = db
    .prepare(
      'SELECT COALESCE(SUM(amount),0) total FROM payments WHERE paid_date>=? AND paid_date<=?',
    )
    .get(start, end).total;
  return summarizeOrders(orders, collected, start, end);
}
export function analyticsRoutes(db) {
  const router = Router();
  router.get('/dashboard', permit('viewDashboard'), (req, res) => {
    const report = analytics(db, '0001-01-01', '9999-12-31');
    const inventory = db
      .prepare(
        'SELECT COUNT(*) products,COALESCE(SUM(stock),0) units,COALESCE(SUM(stock*cost),0) value,SUM(CASE WHEN stock<=reorder_level THEN 1 ELSE 0 END) low FROM products',
      )
      .get();
    const lowStock = db
      .prepare(
        'SELECT id,name,sku,stock,reorder_level,unit FROM products WHERE stock<=reorder_level ORDER BY stock,name LIMIT 6',
      )
      .all();
    const recentOrders = has(req.user, 'viewOrders')
      ? db
          .prepare(orderSelect + ' ORDER BY o.id DESC LIMIT 5')
          .all()
          .map((o) => orderDto(o, req.user))
      : [];
    const summary = { ...report.summary };
    const inventoryDto = { ...inventory, value: inventory.value / 100, low: inventory.low || 0 };
    if (!has(req.user, 'viewCosts')) {
      delete summary.cogs;
      delete summary.grossProfit;
      delete summary.margin;
      delete inventoryDto.value;
    }
    res.json({
      summary,
      inventory: inventoryDto,
      lowStock,
      recentOrders,
      topProducts: report.products
        .slice(0, 5)
        .map((p) => ({ name: p.name, quantity: p.quantity, revenue: p.revenue })),
      weeks: report.weeks
        .slice(-8)
        .map((w) => ({ week: w.week, revenue: w.revenue, orders: w.orders })),
    });
  });
  const range = (req) => {
    const start = date(String(req.query.start || '0001-01-01'), 'Start date');
    const end = date(String(req.query.end || today()), 'End date');
    assert(start <= end, 'Start date must be on or before end date.');
    return { start, end };
  };
  router.get('/reports', permit('viewReports'), (req, res) => {
    const { start, end } = range(req);
    const report = analytics(db, start, end);
    if (!has(req.user, 'viewCosts')) {
      for (const key of ['cogs', 'grossProfit', 'margin']) delete report.summary[key];
      report.products = report.products.map(({ cost, profit, margin, ...p }) => p);
      report.weeks = report.weeks.map(({ cost, profit, ...w }) => w);
    }
    res.json(report);
  });
  router.get('/reports/export', permit('viewReports'), (req, res) => {
    const { start, end } = range(req);
    const data = analytics(db, start, end);
    const section = String(req.query.section || 'products');
    assert(['products', 'customers', 'weeks'].includes(section), 'Choose a valid report section.');
    let columns =
      section === 'products'
        ? [
            ['Product', 'name'],
            ['SKU', 'sku'],
            ['Units sold', 'quantity'],
            ['Net revenue', 'revenue'],
          ]
        : section === 'customers'
          ? [
              ['Customer', 'name'],
              ['Orders', 'orders'],
              ['Net revenue', 'revenue'],
              ['Collected on invoices', 'collected'],
              ['Current balance', 'outstanding'],
            ]
          : [
              ['Week commencing', 'week'],
              ['Orders', 'orders'],
              ['Net revenue', 'revenue'],
            ];
    if (has(req.user, 'viewCosts') && section !== 'customers') {
      columns.push(
        ['Cost of goods', 'cost'],
        ['Gross profit', section === 'weeks' ? 'profit' : 'profit'],
      );
      if (section === 'products') columns.push(['Margin %', 'margin']);
    }
    sendCsv(res, 'sales-report-' + section + '-' + start + '-' + end, data[section], columns);
  });
  return router;
}
