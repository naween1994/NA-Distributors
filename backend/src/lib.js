export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function assert(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function text(value, label, { required = false, max = 1000 } = {}) {
  assert(
    value === undefined || value === null || typeof value === 'string',
    `${label} must be text.`,
  );
  const result = (value ?? '').trim();
  assert(!required || result.length > 0, `${label} is required.`);
  assert(result.length <= max, `${label} must be ${max} characters or fewer.`);
  return result;
}
export function number(value, label, { min = 0, max = 1e9, integer = false } = {}) {
  assert(value !== '' && value !== null && value !== undefined, `${label} is required.`);
  assert(typeof value === 'number' || typeof value === 'string', `${label} must be a number.`);
  const n = Number(value);
  assert(
    Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n)),
    `${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`,
  );
  return n;
}
export function money(value, label = 'Amount') {
  const cents = number(value, label, { max: 1e9 }) * 100;
  assert(
    Math.abs(cents - Math.round(cents)) < 0.0001,
    `${label} must have at most two decimal places.`,
  );
  return Math.round(cents);
}
export function date(value, label = 'Date') {
  assert(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    `${label} must be a valid date.`,
  );
  return value;
}
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function csv(rows, columns) {
  const escape = (v) =>
    '"' +
    String(v ?? '')
      .replaceAll('"', '""')
      .replace(/^[=+@\-\t\r]/, "'$&") +
    '"';
  return (
    '\uFEFF' +
    [
      columns.map((c) => escape(c[0])).join(','),
      ...rows.map((r) =>
        columns.map((c) => escape(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(','),
      ),
    ].join('\r\n')
  );
}
export function sendCsv(res, name, rows, columns) {
  res
    .type('text/csv')
    .attachment(name + '.csv')
    .send(csv(rows, columns));
}
export function has(user, permission) {
  return user.permissions.includes(permission);
}
export function productDto(row, user) {
  if (!row) return null;
  const result = { ...row, lowStock: row.stock <= row.reorder_level };
  for (const key of ['cost', 'mrp', 'wholesale', 'distributor']) result[key] = row[key] / 100;
  if (!has(user, 'viewCosts')) {
    delete result.cost;
    delete result.markup;
  }
  return result;
}
export function customerDto(row) {
  return row
    ? {
        ...row,
        credit_limit: row.credit_limit / 100,
        lifetime_spend: (row.lifetime_spend || 0) / 100,
        outstanding: (row.outstanding || 0) / 100,
      }
    : null;
}
export function orderDto(row, user) {
  const result = { ...row, customer: JSON.parse(row.customer_snapshot), paid: row.paid || 0 };
  delete result.customer_snapshot;
  for (const key of ['subtotal', 'discount_amount', 'total', 'paid']) result[key] /= 100;
  result.balance = Math.round((result.total - result.paid) * 100) / 100;
  result.status = result.balance <= 0 ? 'paid' : result.paid > 0 ? 'partial' : 'unpaid';
  result.overdue = result.balance > 0 && result.due_date < today();
  if (row.items)
    result.items = row.items.map((i) => {
      const item = { ...i, unit_price: i.unit_price / 100, line_total: i.line_total / 100 };
      if (has(user, 'viewCosts')) item.unit_cost = i.unit_cost / 100;
      else delete item.unit_cost;
      return item;
    });
  return result;
}
export const orderSelect = `SELECT o.*,COALESCE((SELECT SUM(amount) FROM payments p WHERE p.order_id=o.id),0) paid FROM orders o`;
export const customerSelect = `SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id=c.id) order_count, COALESCE((SELECT SUM(total) FROM orders o WHERE o.customer_id=c.id),0) lifetime_spend, COALESCE((SELECT SUM(o.total-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.order_id=o.id),0)) FROM orders o WHERE o.customer_id=c.id),0) outstanding FROM customers c`;
