import { orderDto } from './lib.js';
export function summarizeOrders(orders, collected, start, end) {
  const products = new Map(),
    customers = new Map(),
    weeks = new Map();
  let revenue = 0,
    cogs = 0,
    paidOnOrders = 0;
  for (const o of orders) {
    revenue += o.total;
    paidOnOrders += o.paid;
    const customer =
      typeof o.customer_snapshot === 'string'
        ? JSON.parse(o.customer_snapshot)
        : o.customer_snapshot;
    const c = customers.get(o.customer_id) || {
      id: o.customer_id,
      name: customer.business,
      orders: 0,
      revenue: 0,
      collected: 0,
      outstanding: 0,
    };
    c.orders++;
    c.revenue += o.total;
    c.collected += o.paid;
    c.outstanding += o.total - o.paid;
    customers.set(o.customer_id, c);
    const d = new Date(o.order_date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const week = d.toISOString().slice(0, 10);
    const w = weeks.get(week) || { week, revenue: 0, cost: 0, orders: 0 };
    w.revenue += o.total;
    w.orders++;
    const items = o.items || [];
    let allocated = 0;
    items.forEach((i, index) => {
      const cost = i.unit_cost * i.quantity;
      const net =
        index === items.length - 1
          ? o.total - allocated
          : o.subtotal
            ? Math.round((o.total * i.line_total) / o.subtotal)
            : 0;
      allocated += net;
      cogs += cost;
      w.cost += cost;
      const key = i.sku;
      const p = products.get(key) || {
        sku: i.sku,
        name: i.product_name,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };
      p.quantity += i.quantity;
      p.revenue += net;
      p.cost += cost;
      products.set(key, p);
    });
    weeks.set(week, w);
  }
  return {
    range: { start, end },
    summary: {
      revenue: revenue / 100,
      cogs: cogs / 100,
      grossProfit: (revenue - cogs) / 100,
      margin: revenue ? ((revenue - cogs) / revenue) * 100 : 0,
      collected: collected / 100,
      outstanding: (revenue - paidOnOrders) / 100,
      orders: orders.length,
      units: [...products.values()].reduce((a, p) => a + p.quantity, 0),
    },
    products: [...products.values()]
      .map((p) => ({
        ...p,
        revenue: p.revenue / 100,
        cost: p.cost / 100,
        profit: (p.revenue - p.cost) / 100,
        margin: p.revenue ? ((p.revenue - p.cost) / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity),
    customers: [...customers.values()]
      .map((c) => ({
        ...c,
        revenue: c.revenue / 100,
        collected: c.collected / 100,
        outstanding: c.outstanding / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    weeks: [...weeks.values()].map((w) => ({
      ...w,
      revenue: w.revenue / 100,
      cost: w.cost / 100,
      profit: (w.revenue - w.cost) / 100,
    })),
    orders: orders.map(({ items, ...o }) => orderDto(o, { permissions: [] })),
  };
}
