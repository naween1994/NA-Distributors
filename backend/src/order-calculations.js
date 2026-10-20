import { assert, number, text, money, date, today } from './lib.js';
export const METHODS = ['Cash', 'Bank transfer', 'Cheque', 'Card', 'Credit', 'Other'];
export function calculateOrder({ customer, config, productFor }, body) {
  assert(customer, 'Customer not found.', 404);
  const tier = config.pricingTiers.find((t) => t.id === (body.tier || customer.tier) && t.active);
  assert(tier, 'Select an active pricing tier.');
  const order_date = date(body.order_date || today(), 'Order date');
  const due_date = date(body.due_date || order_date, 'Due date');
  assert(due_date >= order_date, 'Due date must be on or after the order date.');
  assert(
    Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 100,
    'Add between 1 and 100 order items.',
  );
  const seen = new Set();
  let subtotal = 0;
  const items = body.items.map((item) => {
    const id = number(item.product_id, 'Product', { integer: true, min: 1 });
    assert(!seen.has(id), 'Combine duplicate products into one line.');
    seen.add(id);
    const p = productFor(id);
    assert(p, 'An order product no longer exists.', 404);
    const quantity = number(item.quantity, 'Quantity', { integer: true, min: 1, max: 1e7 });
    assert(p.stock >= quantity, `${p.name}: only ${p.stock} ${p.unit} available.`, 409);
    const key = tier.priceKey || tier.id;
    assert(
      ['mrp', 'wholesale', 'distributor'].includes(key),
      'Pricing tier has an invalid price source.',
    );
    const unit_price = Math.round(p[key] * (tier.multiplier ?? 1));
    const line_total = unit_price * quantity;
    assert(
      Number.isSafeInteger(line_total) && line_total <= 1e13,
      'Order line value is too large.',
    );
    subtotal += line_total;
    assert(subtotal <= 1e13, 'Order subtotal is too large.');
    return {
      product_id: id,
      product_name: p.name,
      sku: p.sku,
      quantity,
      available: p.stock,
      unit_price,
      unit_cost: p.cost,
      line_total,
    };
  });
  const discount_percent = number(body.discount_percent ?? 0, 'Discount', { max: 100 });
  assert(
    discount_percent === 0 ||
      config.discounts.some(
        (d) => d.percent === discount_percent && subtotal >= Math.round(d.threshold * 100),
      ),
    'This volume discount is not available for the order subtotal.',
  );
  const discount_amount = Math.round((subtotal * discount_percent) / 100);
  const total = subtotal - discount_amount;
  const initial_paid = money(body.initial_paid ?? 0, 'Payment');
  assert(initial_paid <= total, 'Payment cannot exceed the invoice total.');
  const payment_method = text(body.payment_method || 'Cash', 'Payment method');
  assert(METHODS.includes(payment_method), 'Invalid payment method.');
  assert(
    payment_method !== 'Credit' || initial_paid === 0,
    'Choose a collection method to record a payment, or leave the paid amount at zero for credit.',
  );
  const notes = text(body.notes, 'Order notes', { max: 2000 });
  const creditWarning =
    customer.credit_limit > 0 &&
    customer.outstanding + total - initial_paid > customer.credit_limit;
  return {
    customer_id: customer.id,
    customer,
    order_date,
    due_date,
    tier: tier.id,
    items,
    subtotal,
    discount_percent,
    discount_amount,
    total,
    initial_paid,
    payment_method,
    notes,
    creditWarning,
  };
}
