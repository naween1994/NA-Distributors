import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Package,
  SlidersHorizontal,
  ArrowDownToLine,
  MoreHorizontal,
  Pencil,
  Trash2,
  ScanLine,
  History,
  MapPin,
  Tag,
  Boxes,
  Leaf,
  ArrowUpRight,
  Calculator,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../context';
import { useData, useDebounce } from '../hooks';
import { api, post, put, remove, money, count, displayDate } from '../api';
import type { Product } from '../types';
import {
  PageHeader,
  Card,
  Button,
  SearchBox,
  Select,
  Field,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  SaveFooter,
  ExportButton,
  ConfirmDelete,
} from '../components/ui';
import Labels from '../components/Labels';
export function StockForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [mode, setMode] = useState('add'),
    [quantity, setQuantity] = useState(''),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const result = product.stock + (mode === 'add' ? 1 : -1) * Number(quantity);
  return (
    <Modal title="Adjust stock" subtitle={product.name + ' · ' + product.sku} onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await post('/products/' + product.id + '/stock', {
              quantity: (mode === 'add' ? 1 : -1) * Number(quantity),
              note,
            });
            toast('Stock saved to the database.');
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="stock-balance">
          <span>On hand now</span>
          <strong>
            {count(product.stock)} <small>{product.unit}</small>
          </strong>
        </div>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'add' ? 'active' : ''}
            onClick={() => setMode('add')}
          >
            Receive stock
          </button>
          <button
            type="button"
            className={mode === 'remove' ? 'active' : ''}
            onClick={() => setMode('remove')}
          >
            Reduce stock
          </button>
        </div>
        <Field label="Quantity">
          <input
            type="number"
            min={1}
            step={1}
            max={mode === 'remove' ? product.stock : 1e7}
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field
          label="Adjustment note"
          hint="Every adjustment is recorded in the product’s stock history."
        >
          <textarea
            rows={3}
            required
            maxLength={1000}
            placeholder="e.g. Received delivery, batch 2026-10"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        {quantity && (
          <div className={result < 0 ? 'warning-box' : 'calculation-box'}>
            {product.stock} {mode === 'add' ? '+' : '−'} {quantity} ={' '}
            <strong>
              {result} {product.unit} on hand
            </strong>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <SaveFooter busy={busy} onClose={onClose} label="Save stock adjustment" />
      </form>
    </Modal>
  );
}
export function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product?: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { settings, can, toast } = useApp();
  const [values, setValues] = useState<Record<string, string | number>>(() => ({
    name: product?.name || '',
    sku: product?.sku || '',
    barcode: product?.barcode || '',
    category: product?.category || '',
    origin: product?.origin || '',
    size: product?.size || '',
    grade: product?.grade || '',
    batch: product?.batch || '',
    unit: product?.unit || 'packs',
    stock: product?.stock || 0,
    reorder_level: product?.reorder_level ?? 10,
    cost: product?.cost ?? 0,
    mrp: product?.mrp ?? 0,
    wholesale: product?.wholesale ?? 0,
    distributor: product?.distributor ?? 0,
    markup: product?.markup ?? settings?.distributorMarkup ?? 15,
    notes: product?.notes || '',
  }));
  const [auto, setAuto] = useState(!product),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key: string, value: string | number) => setValues((v) => ({ ...v, [key]: value }));
  useEffect(() => {
    if (auto)
      setValues((v) => ({
        ...v,
        distributor: Math.round(Number(v.cost) * (1 + Number(v.markup) / 100) * 100) / 100,
      }));
  }, [auto, values.cost, values.markup]);
  const input = (
    key: string,
    label: string,
    options: { required?: boolean; type?: string; hint?: string; max?: number } = {},
  ) => (
    <Field label={label} hint={options.hint}>
      <input
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        required={options.required}
        type={options.type || 'text'}
        min={options.type === 'number' ? 0 : undefined}
        step={
          options.type === 'number'
            ? ['stock', 'reorder_level'].includes(key)
              ? 1
              : 0.01
            : undefined
        }
        max={options.max}
        maxLength={key === 'notes' ? 2000 : 150}
      />
    </Field>
  );
  return (
    <Modal
      title={product ? 'Edit product' : 'Add a spice product'}
      subtitle="A well-organised catalog starts with the details."
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
            if (product) await put('/products/' + product.id, values);
            else await post('/products', values);
            toast(product ? 'Product updated.' : 'Product added to your inventory.');
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-section-title">
          <Package size={17} />
          Product details
        </div>
        <div className="form-grid">
          {input('name', 'Product name', { required: true })}
          {input('sku', 'SKU', { required: true })}
          {input('barcode', 'Barcode / QR value', {
            hint: 'Use the existing label code or leave blank to use the SKU.',
          })}
          {input('category', 'Category')}
          {input('origin', 'Origin')}
          {input('size', 'Product size', { hint: 'e.g. 100 g, 250 g, 1 kg' })}
          {input('grade', 'Grade')}
          {input('batch', 'Batch / lot number')}
          {input('unit', 'Stock unit', { hint: 'e.g. packs, jars, bags' })}
          {input('reorder_level', 'Reorder threshold', { type: 'number', max: 1e7 })}
          {!product &&
            input('stock', 'Opening stock', {
              type: 'number',
              hint: 'All future stock changes go through stock adjustments.',
              max: 1e7,
            })}
        </div>
        <div className="form-section-title">
          <Tag size={17} />
          Pricing <span>LKR · no tax added</span>
        </div>
        <div className="form-grid three">
          {can('viewCosts') && input('cost', 'Cost per unit (Rs.)', { type: 'number' })}
          {input('mrp', 'MRP / retail (Rs.)', { type: 'number' })}
          {input('wholesale', 'Wholesale (Rs.)', { type: 'number' })}
          {can('viewCosts') &&
            input('markup', 'Distributor markup (%)', { type: 'number', max: 1000 })}
          <Field label="Distributor price (Rs.)">
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={values.distributor}
              readOnly={auto && can('viewCosts')}
              onChange={(e) => set('distributor', e.target.value)}
            />
          </Field>
        </div>
        {can('viewCosts') && (
          <div className="pricing-calculator">
            <label className="checkbox-label">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Calculate distributor price from cost
            </label>
            <div>
              <Calculator size={16} />
              {money(Number(values.cost))} × (1 + {values.markup}% / 100) ={' '}
              <strong>
                {money(
                  Math.round(Number(values.cost) * (1 + Number(values.markup) / 100) * 100) / 100,
                )}
              </strong>
            </div>
          </div>
        )}
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
          label={product ? 'Save product' : 'Add product'}
        />
      </form>
    </Modal>
  );
}
function ProductDetail({
  product,
  onClose,
  onEdit,
  onStock,
  onLabels,
}: {
  product: Product;
  onClose: () => void;
  onEdit: () => void;
  onStock: () => void;
  onLabels: () => void;
}) {
  const { can } = useApp();
  const {
    data: movements,
    loading,
    error,
  } = useData<
    {
      id: number;
      quantity: number;
      balance: number;
      note: string;
      user_name: string;
      created_at: string;
    }[]
  >('/products/' + product.id + '/movements');
  return (
    <Modal
      title={product.name}
      subtitle={product.sku + ' · ' + (product.category || 'Uncategorised')}
      wide
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="detail-stats">
          <div>
            <small>Stock on hand</small>
            <strong>
              {product.stock} <em>{product.unit}</em>
            </strong>
          </div>
          <div>
            <small>Reorder at</small>
            <strong>{product.reorder_level}</strong>
          </div>
          <div>
            <small>Opening stock</small>
            <strong>{product.initial_stock}</strong>
          </div>
          {can('viewCosts') && (
            <div>
              <small>Lot value at cost</small>
              <strong>{money(product.stock * (product.cost || 0))}</strong>
            </div>
          )}
        </div>
        <div className="detail-grid">
          {[
            ['Origin', product.origin],
            ['Size', product.size],
            ['Grade', product.grade],
            ['Batch / lot', product.batch],
            ['Barcode', product.barcode || product.sku],
            ['Cost', can('viewCosts') ? money(product.cost) : null],
            ['MRP', money(product.mrp)],
            ['Wholesale', money(product.wholesale)],
            ['Distributor', money(product.distributor)],
            ['Markup', can('viewCosts') ? product.markup + '%' : null],
          ]
            .filter(([, v]) => v !== null)
            .map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v || '—'}</strong>
              </div>
            ))}
        </div>
        {product.notes && <p className="note-block">{product.notes}</p>}
        <div className="detail-buttons">
          {can('manageInventory') && (
            <>
              <Button variant="secondary" onClick={onEdit}>
                <Pencil size={16} />
                Edit product
              </Button>
              <Button onClick={onStock}>
                <Plus size={16} />
                Adjust stock
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onLabels}>
            <ScanLine size={16} />
            Print labels
          </Button>
        </div>
        <div className="form-section-title">
          <History size={17} />
          Stock movement history
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} />
        ) : movements?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DATE / USER</th>
                  <th>NOTE</th>
                  <th>CHANGE</th>
                  <th>BALANCE</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {displayDate(m.created_at)}
                      <small>{m.user_name || 'Deleted user'}</small>
                    </td>
                    <td>{m.note}</td>
                    <td className={m.quantity > 0 ? 'text-green' : 'text-amber'}>
                      {m.quantity > 0 ? '+' : ''}
                      {m.quantity}
                    </td>
                    <td>{m.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            compact
            title="No stock movements yet"
            description="Receipts, adjustments and orders will be recorded here."
          />
        )}
      </div>
    </Modal>
  );
}
export default function Inventory() {
  const { can, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || ''),
    [category, setCategory] = useState(''),
    [low, setLow] = useState(params.get('low') === 'true');
  const debounced = useDebounce(search);
  const { data, loading, error, reload } = useData<Product[]>(
    '/products?' + new URLSearchParams({ search: debounced, category, low: String(low) }),
  );
  const [all, setAll] = useState<Product[]>([]);
  const [form, setForm] = useState<Product | 'new' | null>(null),
    [stock, setStock] = useState<Product | null>(null),
    [detail, setDetail] = useState<Product | null>(null),
    [labels, setLabels] = useState<Product | null>(null),
    [deleting, setDeleting] = useState<Product | 'all' | null>(null),
    [receive, setReceive] = useState(false);
  useEffect(() => {
    api<Product[]>('/products')
      .then(setAll)
      .catch(() => {});
  }, [data]);
  useEffect(() => {
    if (params.get('action') === 'add' && can('manageInventory')) {
      setForm('new');
      setParams({}, { replace: true });
    }
    if (params.get('action') === 'receive' && can('manageInventory')) {
      setReceive(true);
      setParams({}, { replace: true });
    }
    if (params.has('q')) setSearch(params.get('q') || '');
  }, [params]);
  const categories = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
  const reset = () => {
    setForm(null);
    setStock(null);
    setDetail(null);
    reload();
  };
  return (
    <>
      <PageHeader
        eyebrow="CATALOG & STOCK"
        title="Spice inventory"
        description="Every product, every batch, every little detail."
      >
        <ExportButton
          path={
            '/products/export?' +
            new URLSearchParams({ search: debounced, category, low: String(low) })
          }
          name="na-products.csv"
        />
        {can('manageInventory') && (
          <Button onClick={() => setForm('new')}>
            <Plus size={17} />
            Add product
          </Button>
        )}
      </PageHeader>
      <div className="inventory-summary">
        <div>
          <span className="summary-icon">
            <Package size={22} />
          </span>
          <span>
            <strong>{count(all.length)}</strong>
            <small>Products in catalog</small>
          </span>
        </div>
        <div>
          <span className="summary-icon warm">
            <Boxes size={22} />
          </span>
          <span>
            <strong>{count(all.reduce((a, p) => a + p.stock, 0))}</strong>
            <small>Units on hand</small>
          </span>
        </div>
        <div>
          <span className="summary-icon gold">
            <SlidersHorizontal size={22} />
          </span>
          <span>
            <strong>{all.filter((p) => p.lowStock).length}</strong>
            <small>At or below reorder level</small>
          </span>
        </div>
        {can('viewCosts') && (
          <div>
            <span className="summary-icon">
              <Leaf size={22} />
            </span>
            <span>
              <strong>{money(all.reduce((a, p) => a + p.stock * (p.cost || 0), 0))}</strong>
              <small>Inventory value at cost</small>
            </span>
          </div>
        )}
      </div>
      <Card className="inventory-card">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search products, SKU, barcode or origin…"
            />
            <Select
              aria-label="Category filter"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <label className="checkbox-label low-filter">
            <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} />
            Low stock only
          </label>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.length ? (
          <>
            <div className="table-scroll">
              <table className="product-table">
                <thead>
                  <tr>
                    <th>PRODUCT</th>
                    <th>SKU / BATCH</th>
                    <th>ON HAND</th>
                    {can('viewCosts') && <th>COST</th>}
                    <th>MRP</th>
                    <th>WHOLESALE</th>
                    <th>DISTRIBUTOR</th>
                    <th>STATUS</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        <div className="product-cell">
                          <span className={'product-avatar spice-tone-' + (i % 4)}>
                            <Leaf size={20} />
                          </span>
                          <div>
                            <button className="table-primary" onClick={() => setDetail(p)}>
                              {p.name}
                            </button>
                            <small>
                              {[p.size, p.category, p.origin].filter(Boolean).join(' · ') ||
                                'No category'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="sku">{p.sku}</span>
                        <small>{p.batch || '—'}</small>
                      </td>
                      <td>
                        <strong className={p.lowStock ? 'text-amber' : ''}>{count(p.stock)}</strong>
                        <small>
                          {p.unit} · min {p.reorder_level}
                        </small>
                      </td>
                      {can('viewCosts') && <td>{money(p.cost)}</td>}
                      <td>{money(p.mrp)}</td>
                      <td>{money(p.wholesale)}</td>
                      <td>{money(p.distributor)}</td>
                      <td>
                        <span className={'badge ' + (p.lowStock ? 'low' : 'healthy')}>
                          <span className="badge-dot" />
                          {p.stock === 0 ? 'Out of stock' : p.lowStock ? 'Low stock' : 'In stock'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {can('manageInventory') && (
                            <>
                              <button
                                className="icon-button"
                                title="Adjust stock"
                                aria-label={'Adjust stock for ' + p.name}
                                onClick={() => setStock(p)}
                              >
                                <Plus size={16} />
                              </button>
                              <button
                                className="icon-button"
                                title="Edit product"
                                aria-label={'Edit ' + p.name}
                                onClick={() => setForm(p)}
                              >
                                <Pencil size={15} />
                              </button>
                            </>
                          )}
                          <button
                            className="icon-button"
                            title="Print labels"
                            aria-label={'Print labels for ' + p.name}
                            onClick={() => setLabels(p)}
                          >
                            <ScanLine size={16} />
                          </button>
                          {can('deleteProducts') && (
                            <button
                              className="icon-button danger-text"
                              title="Delete product"
                              aria-label={'Delete ' + p.name}
                              onClick={() => setDeleting(p)}
                            >
                              <Trash2 size={15} />
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
              <span>
                {data.length} {data.length === 1 ? 'product' : 'products'} shown
              </span>
              <span>
                <span className="live-dot" />
                Saved in your database
              </span>
            </div>
          </>
        ) : (
          <Empty
            icon={<Leaf size={30} />}
            title={
              search || category || low
                ? 'No matching spices'
                : 'Good things start with the first spice.'
            }
            description={
              search || category || low
                ? 'Try a different search or clear your filters.'
                : 'Add your products, set your prices and make room for what’s next.'
            }
            action={
              can('manageInventory') && !search && !category && !low ? (
                <Button onClick={() => setForm('new')}>
                  <Plus size={16} />
                  Add your first product
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setCategory('');
                    setLow(false);
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        )}
      </Card>
      <div className="page-note">
        <span>
          <ScanLine size={16} />
          Have a barcode? <a href="/scan">Open the scanner</a> to find a product in seconds.
        </span>
        {can('resetCatalog') && all.length > 0 && (
          <button className="text-button danger-text" onClick={() => setDeleting('all')}>
            <RotateCcw size={14} />
            Reset catalog
          </button>
        )}
      </div>
      {form && (
        <ProductForm
          product={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
          onSaved={reset}
        />
      )}{' '}
      {stock && <StockForm product={stock} onClose={() => setStock(null)} onSaved={reset} />}{' '}
      {detail && (
        <ProductDetail
          product={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setForm(detail);
            setDetail(null);
          }}
          onStock={() => {
            setStock(detail);
            setDetail(null);
          }}
          onLabels={() => {
            setLabels(detail);
            setDetail(null);
          }}
        />
      )}
      {labels && <Labels product={labels} onClose={() => setLabels(null)} />}{' '}
      {deleting && (
        <ConfirmDelete
          title={deleting === 'all' ? 'Reset product catalog?' : 'Delete this product?'}
          description={
            deleting === 'all'
              ? 'All products and stock movements will be removed. Products referenced by invoices must have their orders deleted first.'
              : 'This permanently removes the product and its stock movements. Products referenced in invoices cannot be deleted.'
          }
          onClose={() => setDeleting(null)}
          onConfirm={async (password) => {
            if (deleting === 'all') await post('/products/reset', { adminPassword: password });
            else await remove('/products/' + deleting.id, { adminPassword: password });
            toast('Catalog updated.');
            reload();
          }}
        />
      )}
      {receive && (
        <Modal
          title="Receive stock"
          subtitle="Choose the product you’re restocking."
          onClose={() => setReceive(false)}
        >
          <div className="modal-body">
            {all.length ? (
              <div className="select-product-list">
                {all.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setStock(p);
                      setReceive(false);
                    }}
                  >
                    <span className="product-avatar">
                      <Package size={19} />
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.sku} · {p.stock} {p.unit} on hand
                      </small>
                    </span>
                    <Plus size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Add a product first"
                description="Create a catalog entry before receiving stock."
                action={
                  <Button
                    onClick={() => {
                      setReceive(false);
                      setForm('new');
                    }}
                  >
                    Add product
                  </Button>
                }
              />
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
