import { Router } from 'express';
import { permit } from '../auth.js';
import { summarizeOrders } from '../report-calculations.js';
import { assert, date, today, has, orderDto, sendCsv } from '../lib.js';
export async function analytics(store, start, end, session) {
  const orders = (await store.orderRows({ order_date: { $gte: start, $lte: end } }, session)).sort(
    (a, b) => a.order_date.localeCompare(b.order_date) || a.id - b.id,
  );
  const items = await store.all(
    'order_items',
    { order_id: { $in: orders.map((o) => o.id) } },
    session,
  );
  const byOrder = new Map();
  for (const item of items) {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id).push(item);
  }
  const payments = await store.all('payments', { paid_date: { $gte: start, $lte: end } }, session);
  return summarizeOrders(
    orders.map((o) => ({ ...o, items: byOrder.get(o.id) || [] })),
    payments.reduce((sum, p) => sum + p.amount, 0),
    start,
    end,
  );
}
export function analyticsRoutes(store) {
  const router = Router();
  router.get('/dashboard', permit('viewDashboard'), async (req, res) => {
    const data = await store.transaction(async (s) => {
      const report = await analytics(store, '0001-01-01', '9999-12-31', s);
      const products = await store.all('products', {}, s);
      const inventory = {
        products: products.length,
        units: products.reduce((sum, p) => sum + p.stock, 0),
        value: products.reduce((sum, p) => sum + p.stock * p.cost, 0) / 100,
        low: products.filter((p) => p.stock <= p.reorder_level).length,
      };
      const lowStock = products
        .filter((p) => p.stock <= p.reorder_level)
        .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
        .slice(0, 6)
        .map(({ id, name, sku, stock, reorder_level, unit }) => ({
          id,
          name,
          sku,
          stock,
          reorder_level,
          unit,
        }));
      const recentOrders = has(req.user, 'viewOrders')
        ? (await store.orderRows({}, s))
            .sort((a, b) => b.id - a.id)
            .slice(0, 5)
            .map((o) => orderDto(o, req.user))
        : [];
      if (!has(req.user, 'viewCosts')) {
        for (const k of ['cogs', 'grossProfit', 'margin']) delete report.summary[k];
        delete inventory.value;
      }
      return {
        summary: report.summary,
        inventory,
        lowStock,
        recentOrders,
        topProducts: report.products
          .slice(0, 5)
          .map(({ name, quantity, revenue }) => ({ name, quantity, revenue })),
        weeks: report.weeks
          .slice(-8)
          .map(({ week, revenue, orders }) => ({ week, revenue, orders })),
      };
    });
    res.json(data);
  });
  const range = (req) => {
    const start = date(String(req.query.start || '0001-01-01'), 'Start date'),
      end = date(String(req.query.end || today()), 'End date');
    assert(start <= end, 'Start date must be on or before end date.');
    return { start, end };
  };
  router.get('/reports', permit('viewReports'), async (req, res) => {
    const { start, end } = range(req),
      data = await store.transaction((s) => analytics(store, start, end, s));
    if (!has(req.user, 'viewCosts')) {
      for (const k of ['cogs', 'grossProfit', 'margin']) delete data.summary[k];
      data.products = data.products.map(({ cost, profit, margin, ...p }) => p);
      data.weeks = data.weeks.map(({ cost, profit, ...w }) => w);
    }
    res.json(data);
  });
  router.get('/reports/export', permit('viewReports'), async (req, res) => {
    const { start, end } = range(req),
      data = await store.transaction((s) => analytics(store, start, end, s)),
      section = String(req.query.section || 'products');
    assert(['products', 'customers', 'weeks'].includes(section), 'Choose a valid report section.');
    const columns =
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
      columns.push(['Cost of goods', 'cost'], ['Gross profit', 'profit']);
      if (section === 'products') columns.push(['Margin %', 'margin']);
    }
    sendCsv(res, 'sales-report-' + section + '-' + start + '-' + end, data[section], columns);
  });
  return router;
}
