import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Users,
  MapPin,
  LocateFixed,
  ExternalLink,
  Pencil,
  Phone,
  Mail,
  Wallet,
  ShoppingBag,
  ArrowUpRight,
  Building2,
} from 'lucide-react';
import { useApp } from '../context';
import { useData, useDebounce } from '../hooks';
import { post, put, money, initials, displayDate } from '../api';
import type { Customer } from '../types';
import {
  PageHeader,
  Card,
  Button,
  Field,
  Select,
  SearchBox,
  Loading,
  Empty,
  ErrorBox,
  Modal,
  SaveFooter,
  ExportButton,
  Status,
} from '../components/ui';
export function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { settings, toast } = useApp();
  const [values, setValues] = useState<Record<string, string | number>>(() => ({
    business: customer?.business || '',
    contact: customer?.contact || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    tier: customer?.tier || settings?.pricingTiers.find((t) => t.active)?.id || 'mrp',
    terms_days: customer?.terms_days || 0,
    credit_limit: customer?.credit_limit || 0,
    reference: customer?.reference || '',
    notes: customer?.notes || '',
    latitude: customer?.latitude ?? '',
    longitude: customer?.longitude ?? '',
  }));
  const [busy, setBusy] = useState(false),
    [locating, setLocating] = useState(false),
    [error, setError] = useState('');
  const set = (k: string, v: string | number) => setValues((old) => ({ ...old, [k]: v }));
  const locate = () => {
    if (!navigator.geolocation) {
      setError('GPS is unavailable in this browser. Enter coordinates manually.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        set('latitude', Number(position.coords.latitude.toFixed(6)));
        set('longitude', Number(position.coords.longitude.toFixed(6)));
        setLocating(false);
      },
      (e) => {
        setError(e.message + ' Enter coordinates manually if needed.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <Modal
      title={customer ? 'Edit trade account' : 'Add a customer'}
      subtitle="Good relationships start with knowing the details."
      wide
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (customer) await put('/customers/' + customer.id, values);
            else await post('/customers', values);
            toast(customer ? 'Customer updated.' : 'Customer added to your database.');
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-section-title">
          <Building2 size={17} />
          Business & contact
        </div>
        <div className="form-grid">
          {[
            ['business', 'Business / customer name'],
            ['contact', 'Contact person'],
            ['phone', 'Phone number'],
            ['email', 'Email address'],
            ['reference', 'Account reference'],
          ].map(([k, label]) => (
            <Field key={k} label={label}>
              <input
                required={k === 'business'}
                type={k === 'email' ? 'email' : k === 'phone' ? 'tel' : 'text'}
                maxLength={200}
                value={values[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </Field>
          ))}
        </div>
        <Field label="Business address">
          <textarea
            maxLength={2000}
            rows={2}
            value={values.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>
        <div className="form-section-title">
          <Wallet size={17} />
          Trade terms
        </div>
        <div className="form-grid three">
          <Field label="Default pricing tier">
            <Select value={values.tier} onChange={(e) => set('tier', e.target.value)}>
              {settings?.pricingTiers
                .filter((t) => t.active || customer?.tier === t.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {!t.active ? ' (inactive)' : ''}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Payment terms">
            <Select value={values.terms_days} onChange={(e) => set('terms_days', e.target.value)}>
              {settings?.paymentTerms.map((t, i) => (
                <option value={t.days} key={i}>
                  {t.name} ({t.days} days)
                </option>
              ))}
              {!settings?.paymentTerms.some((t) => t.days === Number(values.terms_days)) && (
                <option value={values.terms_days}>Net {values.terms_days}</option>
              )}
            </Select>
          </Field>
          <Field
            label="Credit limit (Rs.)"
            hint="0 means no stated limit. Orders show a warning rather than block."
          >
            <input
              type="number"
              min={0}
              step="0.01"
              value={values.credit_limit}
              onChange={(e) => set('credit_limit', e.target.value)}
            />
          </Field>
        </div>
        <div className="form-section-title">
          <MapPin size={17} />
          Customer location
          <Button type="button" variant="ghost" disabled={locating} onClick={locate}>
            <LocateFixed size={15} />
            {locating ? 'Locating…' : 'Use current GPS'}
          </Button>
        </div>
        <div className="form-grid">
          <Field label="Latitude">
            <input
              type="number"
              min={-90}
              max={90}
              step="any"
              value={values.latitude}
              onChange={(e) => set('latitude', e.target.value)}
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              min={-180}
              max={180}
              step="any"
              value={values.longitude}
              onChange={(e) => set('longitude', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            maxLength={2000}
            rows={2}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </Field>
        {error && <div className="form-error">{error}</div>}
        <SaveFooter
          busy={busy}
          onClose={onClose}
          label={customer ? 'Save customer' : 'Add customer'}
        />
      </form>
    </Modal>
  );
}
function CustomerDetail({
  customer,
  onClose,
  onEdit,
}: {
  customer: Customer;
  onClose: () => void;
  onEdit: (c: Customer) => void;
}) {
  const { can, settings } = useApp();
  const { data, loading, error } = useData<Customer>('/customers/' + customer.id);
  return (
    <Modal title={customer.business} subtitle="Trade account overview" wide onClose={onClose}>
      <div className="modal-body">
        {loading ? (
          <Loading />
        ) : error || !data ? (
          <ErrorBox message={error} />
        ) : (
          <>
            <div className="customer-profile">
              <span className="customer-avatar large">{initials(data.business)}</span>
              <div>
                <h3>{data.business}</h3>
                <p>{data.contact || 'No contact person added'}</p>
                <span className="tier-tag">
                  {settings?.pricingTiers.find((t) => t.id === data.tier)?.name || data.tier}
                </span>
              </div>
              {can('manageCustomers') && (
                <Button variant="secondary" onClick={() => onEdit(data)}>
                  <Pencil size={15} />
                  Edit
                </Button>
              )}
            </div>
            <div className="detail-stats">
              <div>
                <small>Lifetime orders</small>
                <strong>{data.order_count}</strong>
              </div>
              <div>
                <small>Lifetime spend</small>
                <strong>{money(data.lifetime_spend)}</strong>
              </div>
              <div>
                <small>Outstanding</small>
                <strong className={data.outstanding ? 'text-amber' : ''}>
                  {money(data.outstanding)}
                </strong>
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <small>Phone</small>
                <strong>{data.phone || '—'}</strong>
              </div>
              <div>
                <small>Email</small>
                <strong>{data.email || '—'}</strong>
              </div>
              <div>
                <small>Address</small>
                <strong>{data.address || '—'}</strong>
              </div>
              <div>
                <small>Payment terms</small>
                <strong>{data.terms_days ? 'Net ' + data.terms_days : 'Due on receipt'}</strong>
              </div>
              <div>
                <small>Credit limit</small>
                <strong>{data.credit_limit ? money(data.credit_limit) : 'Not specified'}</strong>
              </div>
              <div>
                <small>Reference</small>
                <strong>{data.reference || '—'}</strong>
              </div>
            </div>
            {data.latitude !== null && data.longitude !== null && (
              <a
                className="map-link"
                href={`https://www.google.com/maps?q=${data.latitude},${data.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                <MapPin size={19} />
                <span>
                  {data.latitude}, {data.longitude}
                  <small>Open customer location in Google Maps</small>
                </span>
                <ExternalLink size={16} />
              </a>
            )}
            {data.notes && <p className="note-block">{data.notes}</p>}
            <div className="form-section-title">
              <ShoppingBag size={17} />
              Order history
            </div>
            {data.orders?.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>INVOICE</th>
                      <th>DATE</th>
                      <th>TOTAL</th>
                      <th>BALANCE</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.id}>
                        <td>
                          {can('viewOrders') ? (
                            <Link
                              to={'/orders?invoice=' + o.id}
                              className="table-primary"
                              onClick={onClose}
                            >
                              {o.invoice}
                            </Link>
                          ) : (
                            o.invoice
                          )}
                        </td>
                        <td>{displayDate(o.order_date)}</td>
                        <td>{money(o.total)}</td>
                        <td>{money(o.balance)}</td>
                        <td>
                          <Status value={o.status} overdue={o.overdue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                compact
                icon={<ShoppingBag size={24} />}
                title="The first order is still to come"
                description="Invoices for this customer will appear here."
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
export default function Customers() {
  const { can, settings } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''),
    [tier, setTier] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useData<Customer[]>(
    '/customers?' + new URLSearchParams({ search: q, tier }),
  );
  const [form, setForm] = useState<Customer | 'new' | null>(null),
    [detail, setDetail] = useState<Customer | null>(null);
  useEffect(() => {
    if (params.get('action') === 'add' && can('manageCustomers')) {
      setForm('new');
      setParams({}, { replace: true });
    }
  }, [params]);
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE & PARTNERSHIPS"
        title="Customer accounts"
        description="Every relationship, thoughtfully looked after."
      >
        <ExportButton
          path={'/customers/export?' + new URLSearchParams({ search: q, tier })}
          name="na-customers.csv"
        />
        {can('manageCustomers') && (
          <Button onClick={() => setForm('new')}>
            <Plus size={17} />
            Add customer
          </Button>
        )}
      </PageHeader>
      <div className="mini-stats">
        <span>
          <Users size={19} />
          <strong>{data?.length || 0}</strong> trade accounts
        </span>
        <span>
          <ShoppingBag size={19} />
          <strong>{data?.reduce((s, c) => s + c.order_count, 0) || 0}</strong> lifetime orders
        </span>
        <span>
          <Wallet size={19} />
          <strong>{money(data?.reduce((s, c) => s + c.outstanding, 0) || 0)}</strong> outstanding
        </span>
      </div>
      <Card>
        <div className="table-toolbar">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search business, contact, phone or reference…"
          />
          <Select
            aria-label="Pricing tier filter"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
          >
            <option value="">All pricing tiers</option>
            {settings?.pricingTiers.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
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
                    <th>BUSINESS / CONTACT</th>
                    <th>PHONE / EMAIL</th>
                    <th>PRICING TIER</th>
                    <th>ORDERS</th>
                    <th>LIFETIME SPEND</th>
                    <th>OUTSTANDING</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="product-cell">
                          <span className="customer-avatar">{initials(c.business)}</span>
                          <div>
                            <button className="table-primary" onClick={() => setDetail(c)}>
                              {c.business}
                            </button>
                            <small>{c.contact || 'No contact person'}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        {c.phone || '—'}
                        <small>{c.email || 'No email added'}</small>
                      </td>
                      <td>
                        <span className="tier-tag">
                          {settings?.pricingTiers.find((t) => t.id === c.tier)?.name || c.tier}
                        </span>
                      </td>
                      <td>{c.order_count}</td>
                      <td>{money(c.lifetime_spend)}</td>
                      <td>
                        <strong className={c.outstanding ? 'text-amber' : 'text-green'}>
                          {money(c.outstanding)}
                        </strong>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            aria-label={'View ' + c.business}
                            onClick={() => setDetail(c)}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                          {can('manageCustomers') && (
                            <button
                              className="icon-button"
                              aria-label={'Edit ' + c.business}
                              onClick={() => setForm(c)}
                            >
                              <Pencil size={16} />
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
              <span>{data.length} accounts shown</span>
              <span>Customer balances update with every payment</span>
            </div>
          </>
        ) : (
          <Empty
            icon={<Users size={29} />}
            title={search || tier ? 'No matching accounts' : 'Your next partnership starts here.'}
            description={
              search || tier
                ? 'Try another search or pricing tier.'
                : 'Add your customers and keep their contacts, terms and orders in one place.'
            }
            action={
              can('manageCustomers') ? (
                <Button onClick={() => setForm('new')}>
                  <Plus size={16} />
                  Add customer
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>
      <div className="page-note">
        <span>
          <MapPin size={16} />
          Save customer coordinates to make your next delivery easier.
        </span>
      </div>
      {form && (
        <CustomerForm
          customer={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
          }}
        />
      )}
      {detail && (
        <CustomerDetail
          customer={detail}
          onClose={() => setDetail(null)}
          onEdit={(c) => {
            setDetail(null);
            setForm(c);
          }}
        />
      )}
    </>
  );
}
