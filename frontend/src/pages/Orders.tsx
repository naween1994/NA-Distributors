import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  ShoppingBag,
  ArrowLeft,
  Trash2,
  ScanLine,
  Calculator,
  Check,
  Printer,
  Wallet,
  ArrowUpRight,
  Leaf,
  Search,
  ChevronRight,
  FileText,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useApp } from '../context';
import { useData, useDebounce } from '../hooks';
import {
  api,
  post,
  remove,
  money,
  displayDate,
  today,
  addDays,
  unitPrice,
  paymentMethods,
} from '../api';
import type { Order, Product, Customer, OrderItem } from '../types';
import {
  Button,
  PageHeader,
  Card,
  Field,
  Select,
  SearchBox,
  Loading,
  ErrorBox,
  Empty,
  Modal,
  SaveFooter,
  Status,
  ExportButton,
  ConfirmDelete,
} from '../components/ui';
import { PrintArea } from '../components/Labels';
import { CustomerForm } from './Customers';
export function allocateItems(items: OrderItem[], total: number, subtotal: number) {
  let allocated = 0;
  return items.map((i, index) => {
    const cents =
      index === items.length - 1
        ? Math.round(total * 100) - allocated
        : subtotal
          ? Math.round(
              (Math.round(total * 100) * Math.round(i.line_total * 100)) /
                Math.round(subtotal * 100),
            )
          : 0;
    allocated += cents;
    return {
      ...i,
      net: cents / 100,
      discount: Math.round((i.line_total - cents / 100) * 100) / 100,
    };
  });
}
function Invoice({ order }: { order: Order }) {
  const { settings } = useApp();
  return (
    <div className="invoice-paper">
      <div className="invoice-top">
        <div className="invoice-brand">
          <span className="brand-mark">
            <Leaf size={26} />
          </span>
          <div>
            <h2>{settings?.appName || 'NA Distributors'}</h2>
            <span>SPICES & TRADE DISTRIBUTION</span>
          </div>
        </div>
        <div className="invoice-label">
          <h2>INVOICE</h2>
          <strong>{order.invoice}</strong>
        </div>
      </div>
      <div className="invoice-company">
        {settings?.businessAddress && <p>{settings.businessAddress}</p>}
        <p>{[settings?.businessPhone, settings?.businessEmail].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="invoice-info">
        <div>
          <small>BILL TO</small>
          <h3>{order.customer.business}</h3>
          <p>{order.customer.contact}</p>
          <p>{order.customer.address}</p>
          <p>{[order.customer.phone, order.customer.email].filter(Boolean).join(' · ')}</p>
        </div>
        <div>
          <div>
            <span>Invoice date</span>
            <strong>{displayDate(order.order_date)}</strong>
          </div>
          <div>
            <span>Payment due</span>
            <strong>{displayDate(order.due_date)}</strong>
          </div>
          <div>
            <span>Pricing tier</span>
            <strong>
              {settings?.pricingTiers.find((t) => t.id === order.tier)?.name || order.tier}
            </strong>
          </div>
          <div>
            <span>Payment method</span>
            <strong>{order.payment_method}</strong>
          </div>
        </div>
      </div>
      <div className="table-scroll">
        <table className="invoice-items">
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th>QTY</th>
              <th>UNIT PRICE</th>
              <th>LINE TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {allocateItems(order.items || [], order.total, order.subtotal).map((i, index) => (
              <tr key={i.id || index}>
                <td>
                  <strong>{i.product_name}</strong>
                  <small>{i.sku}</small>
                  <span className="line-calculation">
                    {money(i.unit_price)} × {i.quantity} = {money(i.line_total)}
                    {order.discount_percent > 0 && (
                      <>
                        {' '}
                        − {money(i.discount)} allocated volume discount ={' '}
                        <strong>{money(i.net)}</strong>
                      </>
                    )}
                  </span>
                </td>
                <td>{i.quantity}</td>
                <td>{money(i.unit_price)}</td>
                <td>
                  <strong>{money(i.net)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="invoice-bottom">
        <div>
          {order.notes && (
            <>
              <small>NOTES</small>
              <p className="pre-wrap">{order.notes}</p>
            </>
          )}
          <div className="invoice-tax-note">No tax added. All values in LKR.</div>
        </div>
        <div className="invoice-totals">
          <div>
            <span>Subtotal</span>
            <strong>{money(order.subtotal)}</strong>
          </div>
          <div>
            <span>Volume discount ({order.discount_percent}%)</span>
            <strong>− {money(order.discount_amount)}</strong>
          </div>
          <div className="invoice-total">
            <span>Invoice total</span>
            <strong>{money(order.total)}</strong>
          </div>
          <div>
            <span>Payments received</span>
            <strong>{money(order.paid)}</strong>
          </div>
          <div className="invoice-balance">
            <span>Balance due</span>
            <strong>{money(order.balance)}</strong>
          </div>
        </div>
      </div>
      <div className="invoice-footer">
        {settings?.invoiceFooter || 'Thank you for your business.'}
        <span>{order.invoice} · NA Distributors</span>
      </div>
    </div>
  );
}
export function PaymentForm({
  order,
  onClose,
  onSaved,
}: {
  order: Order;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [amount, setAmount] = useState(String(order.balance)),
    [method, setMethod] = useState('Cash'),
    [paidDate, setPaidDate] = useState(today()),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title="Record a payment"
      subtitle={order.invoice + ' · ' + order.customer.business}
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await post('/orders/' + order.id + '/payments', {
              amount,
              method,
              reference,
              paid_date: paidDate,
            });
            toast('Payment saved. Customer balance updated.');
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="stock-balance">
          <span>Outstanding balance</span>
          <strong>{money(order.balance)}</strong>
        </div>
        <Field label="Amount collected (Rs.)">
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={order.balance}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <div className="form-grid">
          <Field label="Payment method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {paymentMethods
                .filter((m) => m !== 'Credit')
                .map((m) => (
                  <option key={m}>{m}</option>
                ))}
            </Select>
          </Field>
          <Field label="Payment date">
            <input
              type="date"
              min={order.order_date}
              required
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Reference / receipt number">
          <input maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        {error && <div className="form-error">{error}</div>}
        <SaveFooter busy={busy} onClose={onClose} label="Record payment" />
      </form>
    </Modal>
  );
}
export function OrderDetail({
  id,
  onClose,
  onChange,
}: {
  id: number;
  onClose: () => void;
  onChange: () => void;
}) {
  const { can } = useApp();
  const { data, loading, error, reload } = useData<Order>('/orders/' + id);
  const [payment, setPayment] = useState(false);
  return (
    <>
      {!payment && (
        <Modal
          title={data?.invoice || 'Sales invoice'}
          subtitle={data?.customer.business}
          wide
          onClose={onClose}
        >
          <div className="invoice-modal-body">
            {loading ? (
              <Loading />
            ) : error || !data ? (
              <ErrorBox message={error} retry={reload} />
            ) : (
              <>
                <div className="invoice-toolbar">
                  <Status value={data.status} overdue={data.overdue} />
                  <div>
                    <Button variant="secondary" onClick={() => window.print()}>
                      <Printer size={16} />
                      Print invoice
                    </Button>
                    {can('managePayments') && data.balance > 0 && (
                      <Button onClick={() => setPayment(true)}>
                        <Wallet size={16} />
                        Record payment
                      </Button>
                    )}
                  </div>
                </div>
                <Invoice order={data} />
                {data.payments?.length ? (
                  <div className="payment-history">
                    <h3>Payment history</h3>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>DATE</th>
                            <th>METHOD / REFERENCE</th>
                            <th>RECORDED BY</th>
                            <th>AMOUNT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.payments.map((p) => (
                            <tr key={p.id}>
                              <td>{displayDate(p.paid_date)}</td>
                              <td>
                                {p.method}
                                <small>{p.reference || '—'}</small>
                              </td>
                              <td>{p.recorded_by || 'Deleted user'}</td>
                              <td>{money(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
                <PrintArea>
                  <Invoice order={data} />
                </PrintArea>
              </>
            )}
          </div>
        </Modal>
      )}
      {payment && data && (
        <PaymentForm
          order={data}
          onClose={() => setPayment(false)}
          onSaved={() => {
            setPayment(false);
            reload();
            onChange();
          }}
        />
      )}
    </>
  );
}
export default function Orders() {
  const { can, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('');
  const q = useDebounce(search);
  const { data, error, loading, reload } = useData<Order[]>(
    '/orders?' + new URLSearchParams({ search: q, status }),
  );
  const [detail, setDetail] = useState<number | null>(
      params.get('invoice') ? Number(params.get('invoice')) : null,
    ),
    [payment, setPayment] = useState<Order | null>(null),
    [deleting, setDeleting] = useState<Order | null>(null);
  useEffect(() => {
    if (params.get('invoice')) setDetail(Number(params.get('invoice')));
  }, [params]);
  const closeDetail = () => {
    setDetail(null);
    setParams({}, { replace: true });
  };
  return (
    <>
      <PageHeader
        eyebrow="SALES & INVOICES"
        title="Every order, in order."
        description="From the first item to the final payment."
      >
        <ExportButton
          path={'/orders/export?' + new URLSearchParams({ search: q, status })}
          name="na-sales-orders.csv"
        />
        {can('createOrders') && (
          <Link className="button primary" to="/orders/new">
            <Plus size={17} />
            Create order
          </Link>
        )}
      </PageHeader>
      <div className="mini-stats">
        <span>
          <ShoppingBag size={19} />
          <strong>{data?.length || 0}</strong> orders shown
        </span>
        <span>
          <Wallet size={19} />
          <strong>{money(data?.reduce((a, o) => a + o.total, 0) || 0)}</strong> invoice value
        </span>
        <span>
          <FileText size={19} />
          <strong>{money(data?.reduce((a, o) => a + o.balance, 0) || 0)}</strong> to collect
        </span>
      </div>
      <Card>
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search invoice, customer, product or SKU…"
          />
          <Select
            aria-label="Payment status filter"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All payment statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Part paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
          </Select>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>INVOICE</th>
                    <th>CUSTOMER</th>
                    <th>ORDER / DUE DATE</th>
                    <th>INVOICE TOTAL</th>
                    <th>BALANCE</th>
                    <th>STATUS</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <button
                          className="table-primary invoice-number"
                          onClick={() => setDetail(o.id)}
                        >
                          {o.invoice}
                        </button>
                      </td>
                      <td>
                        <strong>{o.customer.business}</strong>
                        <small>{o.customer.contact}</small>
                      </td>
                      <td>
                        {displayDate(o.order_date)}
                        <small className={o.overdue ? 'text-amber' : ''}>
                          Due {displayDate(o.due_date)}
                        </small>
                      </td>
                      <td>{money(o.total)}</td>
                      <td>
                        <strong>{money(o.balance)}</strong>
                        <small>{money(o.paid)} paid</small>
                      </td>
                      <td>
                        <Status value={o.status} overdue={o.overdue} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={'View ' + o.invoice}
                            onClick={() => setDetail(o.id)}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                          {can('managePayments') && o.balance > 0 && (
                            <button
                              className="icon-button"
                              aria-label={'Record payment for ' + o.invoice}
                              onClick={() => setPayment(o)}
                            >
                              <Wallet size={16} />
                            </button>
                          )}
                          {can('deleteOrders') && (
                            <button
                              className="icon-button danger-text"
                              aria-label={'Delete ' + o.invoice}
                              onClick={() => setDeleting(o)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>{data.length} orders shown</span>
              <span>Inventory updates when an order is created</span>
            </div>
          </>
        ) : (
          <Empty
            icon={<ShoppingBag size={29} />}
            title={search || status ? 'No matching orders' : 'A new sale. A fresh possibility.'}
            description={
              search || status
                ? 'Try another search or payment status.'
                : 'Create your first order and turn the details into a clear, printable invoice.'
            }
            action={
              can('createOrders') ? (
                <Link to="/orders/new" className="button primary">
                  <Plus size={16} />
                  Create sales order
                </Link>
              ) : undefined
            }
          />
        )}
      </Card>
      <div className="page-note">
        <span>
          <Calculator size={16} />
          Volume discounts are chosen manually. New orders have no added tax.
        </span>
      </div>
      {detail !== null && <OrderDetail id={detail} onClose={closeDetail} onChange={reload} />}{' '}
      {payment && (
        <PaymentForm
          order={payment}
          onClose={() => setPayment(null)}
          onSaved={() => {
            setPayment(null);
            reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title={'Delete ' + deleting.invoice + '?'}
          description="This removes the invoice and all recorded payments. Item quantities are returned to inventory, and customer balances are recalculated."
          onClose={() => setDeleting(null)}
          onConfirm={async (password) => {
            await remove('/orders/' + deleting.id, { adminPassword: password });
            toast('Order deleted. Stock restored.');
            reload();
          }}
        />
      )}
    </>
  );
}
interface Quote {
  subtotal: number;
  discount_amount: number;
  total: number;
  initial_paid: number;
  creditWarning: boolean;
  items: { product_name: string; quantity: number; unit_price: number; line_total: number }[];
}
export function NewOrder() {
  const { settings, can, toast } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const customers = useData<Customer[]>('/customers'),
    products = useData<Product[]>('/products');
  const [customerId, setCustomerId] = useState(''),
    [tier, setTier] = useState(settings?.pricingTiers.find((t) => t.active)?.id || 'mrp'),
    [orderDate, setOrderDate] = useState(today()),
    [dueDate, setDueDate] = useState(today()),
    [items, setItems] = useState<{ product_id: number; quantity: number }[]>([]),
    [discount, setDiscount] = useState(0),
    [method, setMethod] = useState('Cash'),
    [paid, setPaid] = useState('0'),
    [notes, setNotes] = useState(''),
    [search, setSearch] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [quote, setQuote] = useState<Quote | null>(null),
    [newCustomer, setNewCustomer] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID?.() || Date.now() + '-' + Math.random());
  const customer = customers.data?.find((c) => c.id === Number(customerId));
  const activeTier = settings?.pricingTiers.find((t) => t.id === tier);
  const enriched = items.map((i) => ({
    ...i,
    product: products.data?.find((p) => p.id === i.product_id),
  }));
  const subtotal =
    Math.round(
      enriched.reduce(
        (sum, i) =>
          sum + (i.product ? Math.round(unitPrice(i.product, activeTier) * 100) * i.quantity : 0),
        0,
      ),
    ) / 100;
  const discountAmount = Math.round((Math.round(subtotal * 100) * discount) / 100) / 100;
  const total = Math.round((subtotal - discountAmount) * 100) / 100;
  const eligible = settings?.discounts.filter((d) => d.threshold <= subtotal) || [];
  const creditWarning =
    !!customer?.credit_limit && customer.outstanding + total - Number(paid) > customer.credit_limit;
  useEffect(() => {
    const id = Number(params.get('product'));
    if (id && products.data?.some((p) => p.id === id))
      setItems((old) =>
        old.some((i) => i.product_id === id) ? old : [...old, { product_id: id, quantity: 1 }],
      );
  }, [params, products.data]);
  useEffect(() => {
    if (discount && !eligible.some((d) => d.percent === discount)) setDiscount(0);
  }, [subtotal, discount]);
  function selectCustomer(id: string) {
    setCustomerId(id);
    const c = customers.data?.find((c) => c.id === Number(id));
    if (c) {
      setTier(c.tier);
      setDueDate(addDays(orderDate, c.terms_days));
    }
  }
  const add = (product: Product) => {
    setItems((old) => {
      const found = old.find((i) => i.product_id === product.id);
      return found
        ? old.map((i) => (i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
        : [...old, { product_id: product.id, quantity: 1 }];
    });
    setSearch('');
  };
  const payload = () => ({
    request_id: requestId,
    customer_id: Number(customerId),
    tier,
    order_date: orderDate,
    due_date: dueDate,
    items,
    discount_percent: discount,
    initial_paid: can('managePayments') ? Number(paid) : 0,
    payment_method: method,
    notes,
  });
  const review = async () => {
    setError('');
    setBusy(true);
    try {
      setQuote(await post<Quote>('/orders/quote', payload()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const order = await post<Order>('/orders', payload());
      toast(order.invoice + ' created. Stock and balances saved.');
      navigate('/orders?invoice=' + order.id);
    } catch (e) {
      setError((e as Error).message);
      setQuote(null);
    } finally {
      setBusy(false);
    }
  };
  if (customers.loading || products.loading) return <Loading />;
  if (customers.error || products.error)
    return (
      <ErrorBox
        message={customers.error || products.error}
        retry={() => {
          customers.reload();
          products.reload();
        }}
      />
    );
  return (
    <>
      <Link className="back-link" to="/orders">
        <ArrowLeft size={16} />
        Back to sales orders
      </Link>
      <PageHeader
        eyebrow="LET’S MAKE A SALE"
        title="Create sales order"
        description="Choose your customer, add your spices, and see every calculation."
      />
      {!products.data?.length || !customers.data?.length ? (
        <Card>
          <Empty
            icon={<ShoppingBag size={29} />}
            title="A few details before your first order"
            description="Orders need a customer and products with stock. Start by adding what’s missing."
            action={
              <div className="inline-actions">
                {!products.data?.length && can('manageInventory') && (
                  <Link className="button primary" to="/inventory?action=add">
                    Add a product
                  </Link>
                )}
                {!products.data?.length && !can('manageInventory') && (
                  <p>Ask your inventory manager to add products and stock.</p>
                )}
                {!customers.data?.length && can('manageCustomers') && (
                  <Button onClick={() => setNewCustomer(true)}>Add a customer</Button>
                )}
              </div>
            }
          />
        </Card>
      ) : (
        <div className="order-builder">
          <div className="order-builder-main">
            <Card>
              <div className="card-heading">
                <div>
                  <h2>1. Customer & order details</h2>
                  <p>The right terms for the right relationship.</p>
                </div>
              </div>
              <div className="card-form">
                <div className="form-grid">
                  <Field label="Customer">
                    <Select
                      required
                      value={customerId}
                      onChange={(e) => selectCustomer(e.target.value)}
                    >
                      <option value="">Choose a trade account</option>
                      {customers.data.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.business}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Order pricing tier"
                    hint="Defaults to the customer’s tier. An active tier can be selected for this order."
                  >
                    <Select value={tier} onChange={(e) => setTier(e.target.value)}>
                      {settings?.pricingTiers
                        .filter((t) => t.active)
                        .map((t) => (
                          <option value={t.id} key={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Order date">
                    <input
                      type="date"
                      required
                      value={orderDate}
                      onChange={(e) => {
                        setOrderDate(e.target.value);
                        setDueDate(addDays(e.target.value, customer?.terms_days || 0));
                      }}
                    />
                  </Field>
                  <Field label="Payment due">
                    <input
                      type="date"
                      required
                      min={orderDate}
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </Field>
                </div>
                {customer && (
                  <div className="customer-order-info">
                    <span>
                      {customer.contact || customer.business} ·{' '}
                      {customer.terms_days ? 'Net ' + customer.terms_days : 'Due on receipt'}
                    </span>
                    <strong>Open balance {money(customer.outstanding)}</strong>
                  </div>
                )}
                {customer && !settings?.pricingTiers.find((t) => t.id === tier && t.active) && (
                  <p className="warning-box">
                    The customer’s tier is inactive. Select an active pricing tier for this order.
                  </p>
                )}
              </div>
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <h2>2. The good stuff</h2>
                  <p>Add products and set your quantities.</p>
                </div>
                <span className="count-pill">{items.length} items</span>
              </div>
              <div className="card-form">
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Find a product by name or SKU…"
                />
                {search && (
                  <div className="product-picker">
                    {products.data
                      .filter((p) =>
                        [p.name, p.sku, p.barcode].some((v) =>
                          v?.toLowerCase().includes(search.toLowerCase()),
                        ),
                      )
                      .slice(0, 12)
                      .map((p) => (
                        <button key={p.id} disabled={p.stock === 0} onClick={() => add(p)}>
                          <span className="product-avatar">
                            <Leaf size={17} />
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small>
                              {p.sku} · {p.stock} {p.unit} available
                            </small>
                          </span>
                          <b>{money(unitPrice(p, activeTier))}</b>
                          <Plus size={16} />
                        </button>
                      ))}
                    {!products.data.some((p) =>
                      [p.name, p.sku, p.barcode].some((v) =>
                        v?.toLowerCase().includes(search.toLowerCase()),
                      ),
                    ) && <p className="muted">No matching products.</p>}
                  </div>
                )}
                <form
                  className="scan-inline"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const product = await api<Product>(
                        '/products/lookup/' + encodeURIComponent(code.trim()),
                      );
                      add(product);
                      setCode('');
                      toast(product.name + ' added.');
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  }}
                >
                  <ScanLine size={18} />
                  <input
                    placeholder="Scan or enter a barcode / SKU"
                    aria-label="Barcode or SKU for order"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                  <button disabled={!code.trim()} type="submit">
                    Add
                  </button>
                </form>
              </div>
              {items.length ? (
                <div className="order-item-list">
                  {enriched.map((i) => {
                    if (!i.product) return null;
                    const p = i.product;
                    const unit = unitPrice(p, activeTier);
                    return (
                      <div className="order-item" key={p.id}>
                        <div className="order-item-top">
                          <span className="product-avatar">
                            <Leaf size={18} />
                          </span>
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {p.sku} · {p.stock} {p.unit} available
                            </small>
                          </div>
                          <strong>{money((Math.round(unit * 100) * i.quantity) / 100)}</strong>
                          <button
                            className="icon-button danger-text"
                            aria-label={'Remove ' + p.name}
                            onClick={() =>
                              setItems((old) => old.filter((x) => x.product_id !== p.id))
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="item-quantity-row">
                          <Field label="Quantity">
                            <input
                              aria-label={'Quantity for ' + p.name}
                              type="number"
                              min={1}
                              max={p.stock}
                              step={1}
                              value={i.quantity}
                              onChange={(e) =>
                                setItems((old) =>
                                  old.map((x) =>
                                    x.product_id === p.id
                                      ? { ...x, quantity: Number(e.target.value) }
                                      : x,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <div>
                            <small>{activeTier?.name} unit price</small>
                            <strong>{money(unit)}</strong>
                          </div>
                          <div>
                            <small>Stock after order</small>
                            <strong className={p.stock - i.quantity < 0 ? 'danger-text' : ''}>
                              {p.stock - i.quantity} {p.unit}
                            </strong>
                          </div>
                        </div>
                        <div
                          className={'item-calculation ' + (i.quantity > p.stock ? 'invalid' : '')}
                        >
                          <Calculator size={15} />
                          <span>
                            {money(unit)} × {i.quantity} ={' '}
                            <strong>{money((Math.round(unit * 100) * i.quantity) / 100)}</strong>{' '}
                            before order discount
                          </span>
                        </div>
                        {i.quantity > p.stock && (
                          <p className="form-error">Requested quantity exceeds available stock.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  compact
                  title="Make room for your first item"
                  description="Search above or scan a product code to begin."
                />
              )}
            </Card>
            <Card>
              <div className="card-heading">
                <h2>3. Payment & notes</h2>
              </div>
              <div className="card-form">
                <div className="form-grid">
                  <Field label="Payment method">
                    <Select
                      value={method}
                      onChange={(e) => {
                        setMethod(e.target.value);
                        if (e.target.value === 'Credit') setPaid('0');
                      }}
                    >
                      {paymentMethods.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </Field>
                  {can('managePayments') && (
                    <Field label="Amount paid now (Rs.)" hint="Leave at 0 for an unpaid invoice.">
                      <input
                        type="number"
                        min={0}
                        max={total}
                        step="0.01"
                        value={paid}
                        onChange={(e) => setPaid(e.target.value)}
                      />
                    </Field>
                  )}
                </div>
                <Field label="Order notes">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    placeholder="Delivery instructions, references, or anything useful…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
              </div>
            </Card>
          </div>
          <div className="order-summary-column">
            <Card className="order-summary">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">EVERY DETAIL ADDS UP</span>
                  <h2>Order summary</h2>
                </div>
                <Calculator size={22} />
              </div>
              <div className="summary-body">
                <div className="summary-line">
                  <span>
                    {items.length} products · {items.reduce((s, i) => s + i.quantity, 0)} units
                  </span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <Field
                  label="Manual volume discount"
                  hint={
                    eligible.length
                      ? 'Eligible discounts are based on the subtotal. Select one to apply it.'
                      : 'Add items to unlock an order-volume discount.'
                  }
                >
                  <Select value={discount} onChange={(e) => setDiscount(Number(e.target.value))}>
                    <option value={0}>No discount</option>
                    {eligible.map((d) => (
                      <option key={d.percent} value={d.percent}>
                        {d.percent}% · from {money(d.threshold)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {eligible.length > 0 && discount === 0 && (
                  <div className="discount-suggestion">
                    Eligible for up to {eligible.at(-1)?.percent}% off. Choose a discount above.
                  </div>
                )}
                <div className="summary-line">
                  <span>Volume discount ({discount}%)</span>
                  <strong>− {money(discountAmount)}</strong>
                </div>
                <div className="summary-line">
                  <span>Tax</span>
                  <strong>{money(0)}</strong>
                </div>
                <div className="summary-line total">
                  <span>Invoice total</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="summary-line">
                  <span>Paid now</span>
                  <strong>{money(can('managePayments') ? Number(paid) : 0)}</strong>
                </div>
                <div className="summary-line balance">
                  <span>Balance due</span>
                  <strong>{money(total - (can('managePayments') ? Number(paid) : 0))}</strong>
                </div>
                {discount > 0 && (
                  <div className="calculation-box small">
                    {money(subtotal)} × {discount}% = {money(discountAmount)} discount.
                    <br />
                    {money(subtotal)} − {money(discountAmount)} = {money(total)}.
                  </div>
                )}
                {creditWarning && (
                  <div className="warning-box">
                    This order would exceed the customer’s {money(customer?.credit_limit)} credit
                    limit. Check the account before proceeding. This is a warning; it does not block
                    the order.
                  </div>
                )}
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <Button
                  className="full-width"
                  disabled={busy || !customerId || !items.length}
                  onClick={() => void review()}
                >
                  {busy ? 'Checking…' : 'Review order'}
                  <ChevronRight size={17} />
                </Button>
                <div className="summary-reassurance">
                  <ShieldCheck size={15} />
                  <span>Stock, prices and totals are verified by the server before saving.</span>
                </div>
              </div>
            </Card>
            <Card className="discount-guide">
              <h3>More in the basket. More value.</h3>
              <p>Your order-volume discount guide</p>
              {settings?.discounts.map((d) => (
                <div key={d.threshold} className={subtotal >= d.threshold ? 'eligible' : ''}>
                  <span>{money(d.threshold)}+</span>
                  <strong>
                    {d.percent}%{subtotal >= d.threshold && <Check size={13} />}
                  </strong>
                </div>
              ))}
              <small>Choose a single eligible rate. Discounts are not combined.</small>
            </Card>
          </div>
        </div>
      )}
      {quote && (
        <Modal
          title="Ready to make it an order?"
          subtitle="One final look before stock and balances update."
          onClose={() => {
            if (!busy) setQuote(null);
          }}
        >
          <div className="modal-body">
            <div className="review-customer">
              <span className="section-label">CUSTOMER</span>
              <h3>{customer?.business}</h3>
              <p>
                {displayDate(orderDate)} · Due {displayDate(dueDate)}
              </p>
            </div>
            {quote.items.map((i, index) => (
              <div className="review-line" key={index}>
                <span>
                  {i.product_name}
                  <small>
                    {i.quantity} × {money(i.unit_price)}
                  </small>
                </span>
                <strong>{money(i.line_total)}</strong>
              </div>
            ))}
            <div className="review-line">
              <span>Discount ({discount}%)</span>
              <strong>− {money(quote.discount_amount)}</strong>
            </div>
            <div className="review-line review-total">
              <span>Invoice total</span>
              <strong>{money(quote.total)}</strong>
            </div>
            <div className="review-line">
              <span>Paid now / balance due</span>
              <strong>
                {money(quote.initial_paid)} /{' '}
                {money(Math.round((quote.total - quote.initial_paid) * 100) / 100)}
              </strong>
            </div>
            {quote.creditWarning && (
              <div className="warning-box">
                This order exceeds the customer’s recorded credit limit.
              </div>
            )}
            <div className="info-box">
              <Info size={18} />
              <span>Creating this order deducts stock immediately. No tax will be added.</span>
            </div>
            <div className="form-actions">
              <Button variant="secondary" disabled={busy} onClick={() => setQuote(null)}>
                Back to editing
              </Button>
              <Button disabled={busy} onClick={() => void create()}>
                <Check size={17} />
                {busy ? 'Saving order…' : 'Create order'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {newCustomer && (
        <CustomerForm
          onClose={() => setNewCustomer(false)}
          onSaved={() => {
            setNewCustomer(false);
            customers.reload();
          }}
        />
      )}
    </>
  );
}
