import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Plus,
  Wallet,
  HandCoins,
  Clock3,
  Package,
  Boxes,
  TriangleAlert,
  ShoppingBag,
  ArrowUpRight,
  TrendingUp,
  Leaf,
  ScanLine,
  Users,
  CheckCircle2,
  ChartNoAxesCombined,
} from 'lucide-react';
import { useApp } from '../context';
import { useData } from '../hooks';
import type { DashboardData, Product } from '../types';
import { compactMoney, money, count, displayDate } from '../api';
import {
  PageHeader,
  Card,
  StatCard,
  Empty,
  Loading,
  ErrorBox,
  Status,
  Button,
} from '../components/ui';
import { SalesChart, ProgressBar } from '../components/Charts';
import { useState } from 'react';
import { StockForm } from './Inventory';
export default function Dashboard() {
  const { user, can } = useApp();
  const { data, error, loading, reload } = useData<DashboardData>('/dashboard');
  const [restock, setRestock] = useState<Product | null>(null);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} retry={reload} />;
  const { summary, inventory } = data;
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Colombo',
  }).format(new Date());
  const links = [
    {
      to: '/orders/new',
      icon: ShoppingBag,
      title: 'Create an order',
      detail: 'Turn a sale into an invoice',
      permission: 'createOrders',
    },
    {
      to: '/inventory?action=receive',
      icon: Boxes,
      title: 'Receive stock',
      detail: 'Keep your shelves ready',
      permission: 'manageInventory',
    },
    {
      to: '/inventory',
      icon: Package,
      title: 'Browse inventory',
      detail: 'Every spice, in one place',
      permission: 'viewInventory',
    },
    {
      to: '/reports',
      icon: ChartNoAxesCombined,
      title: 'View reports',
      detail: 'Know what’s moving',
      permission: 'viewReports',
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow={dateLabel}
        title={`Good ${Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo', hour: 'numeric', hour12: false })) < 12 ? 'morning' : Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo', hour: 'numeric', hour12: false })) < 17 ? 'afternoon' : 'evening'}, ${user!.name.split(' ')[0]}.`}
        description="Here’s what’s happening with your business today."
      >
        {can('createOrders') && (
          <Link className="button primary" to="/orders/new">
            <Plus size={17} />
            New sales order
          </Link>
        )}
      </PageHeader>
      <div className="dashboard-banner">
        <div className="banner-leaf">
          <Leaf size={25} />
        </div>
        <div>
          <strong>A clear view. A confident next step.</strong>
          <span>Your inventory, sales and customer accounts — all in one place.</span>
        </div>
        <span className="banner-tag">
          <span className="live-dot" /> LIVE WORKSPACE
        </span>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Sales revenue"
          value={compactMoney(summary.revenue)}
          detail={`${count(summary.orders)} orders · all time`}
          icon={<Wallet size={20} />}
          highlight
        />
        <StatCard
          label="Payments collected"
          value={compactMoney(summary.collected)}
          detail="Recorded customer payments"
          icon={<HandCoins size={20} />}
        />
        <StatCard
          label="Outstanding balance"
          value={compactMoney(summary.outstanding)}
          detail="Across all open invoices"
          icon={<Clock3 size={20} />}
        />
        <StatCard
          label={can('viewCosts') ? 'Inventory value' : 'Products in catalog'}
          value={can('viewCosts') ? compactMoney(inventory.value) : count(inventory.products)}
          detail={
            can('viewCosts')
              ? 'At current cost · ' + count(inventory.units) + ' units'
              : count(inventory.units) + ' units on hand'
          }
          icon={<Package size={20} />}
        />
      </div>
      <div className="inventory-pulse">
        <div>
          <span className="pulse-icon">
            <Boxes size={17} />
          </span>
          <strong>{count(inventory.products)}</strong>
          <span>products in inventory</span>
        </div>
        <div>
          <span className={'pulse-icon ' + (inventory.low ? 'amber' : '')}>
            <TriangleAlert size={17} />
          </span>
          <strong>{inventory.low}</strong>
          <span>need a stock check</span>
          {can('viewInventory') && (
            <Link to="/inventory?low=true">
              View inventory <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>
      <div className="dashboard-main-grid">
        <Card className="revenue-card">
          <div className="card-heading">
            <div>
              <h2>Sales overview</h2>
              <p>A weekly look at your revenue</p>
            </div>
            <span className="subtle-pill">
              {data.weeks.length ? 'Last ' + data.weeks.length + ' active weeks' : 'No sales yet'}
              <TrendingUp size={14} />
            </span>
          </div>
          <div className="chart-summary">
            <strong>{money(summary.revenue)}</strong>
            <span>
              <span className="legend-dot" />
              Sales revenue
            </span>
          </div>
          <SalesChart data={data.weeks} />
        </Card>
        <Card className="quick-actions">
          <div className="card-heading">
            <div>
              <h2>Make your next move</h2>
              <p>The things you do, a little faster.</p>
            </div>
            <span className="small-icon">
              <ArrowUpRight size={18} />
            </span>
          </div>
          <div className="quick-action-list">
            {links
              .filter((l) => can(l.permission))
              .map((l, i) => (
                <Link key={l.to} to={l.to} className="quick-action">
                  <span className={'quick-icon tone-' + i}>
                    <l.icon size={20} />
                  </span>
                  <span>
                    <strong>{l.title}</strong>
                    <small>{l.detail}</small>
                  </span>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
          </div>
        </Card>
      </div>
      <div className="dashboard-lower-grid">
        <Card className="recent-orders">
          <div className="card-heading">
            <div>
              <h2>Recent orders</h2>
              <p>Your latest business, at a glance.</p>
            </div>
            {can('viewOrders') && (
              <Link className="text-link" to="/orders">
                View all <ArrowRight size={15} />
              </Link>
            )}
          </div>
          {data.recentOrders.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>INVOICE / CUSTOMER</th>
                    <th>DATE</th>
                    <th>AMOUNT</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link className="table-primary" to={'/orders?invoice=' + o.id}>
                          {o.invoice}
                        </Link>
                        <small>{o.customer.business}</small>
                      </td>
                      <td>{displayDate(o.order_date)}</td>
                      <td className="numeric">{money(o.total)}</td>
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
              icon={<ShoppingBag size={25} />}
              title="Ready for your first order"
              description="Your latest invoices will appear here as business comes in."
              action={
                can('createOrders') ? (
                  <Link className="text-link" to="/orders/new">
                    Create an order <ArrowRight size={15} />
                  </Link>
                ) : undefined
              }
            />
          )}
        </Card>
        <Card className="low-stock-card">
          <div className="card-heading">
            <div>
              <h2>Stock watch</h2>
              <p>A little attention goes a long way.</p>
            </div>
            <span className={'count-pill ' + (inventory.low ? 'amber' : '')}>{inventory.low}</span>
          </div>
          {data.lowStock.length ? (
            <div className="stock-watch-list">
              {data.lowStock.map((p) => (
                <div className="stock-watch-item" key={p.id}>
                  <span className="product-avatar">
                    <Package size={18} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.stock} {p.unit} left · reorder at {p.reorder_level}
                    </small>
                  </div>
                  {can('manageInventory') && (
                    <button
                      className="icon-button"
                      aria-label={'Restock ' + p.name}
                      onClick={() => setRestock(p)}
                    >
                      <Plus size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="stock-clear">
              <div>
                <CheckCircle2 size={30} />
              </div>
              <strong>
                {inventory.products
                  ? 'Your shelves look healthy'
                  : 'A fresh start for your inventory'}
              </strong>
              <p>
                {inventory.products
                  ? 'No products are below their reorder level. We’ll keep an eye on things.'
                  : 'Add your products and we’ll help you keep the right stock on hand.'}
              </p>
              {can('manageInventory') && (
                <Link className="text-link" to="/inventory?action=add">
                  {inventory.products ? 'Browse inventory' : 'Add your first product'}
                  <ArrowRight size={15} />
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>
      <div className="dashboard-bottom-grid">
        <Card>
          <div className="card-heading">
            <div>
              <h2>Top-selling spices</h2>
              <p>The products your customers love.</p>
            </div>
            <span className="small-icon">
              <TrendingUp size={18} />
            </span>
          </div>
          {data.topProducts.length ? (
            <div className="top-products">
              {data.topProducts.map((p, i) => (
                <div className="top-product" key={p.name}>
                  <span className="rank">0{i + 1}</span>
                  <div>
                    <div>
                      <strong>{p.name}</strong>
                      <span>{p.quantity} units</span>
                    </div>
                    <ProgressBar value={p.quantity} max={data.topProducts[0].quantity} />
                  </div>
                  <strong>{money(p.revenue)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              compact
              icon={<Leaf size={24} />}
              title="Your bestsellers are on their way"
              description="As orders arrive, discover what keeps customers coming back."
            />
          )}
        </Card>
        <Card className="getting-started">
          <div className="card-heading">
            <div>
              <span className="eyebrow">GROW AT YOUR OWN PACE</span>
              <h2>A good business starts here.</h2>
              <p>Small steps. A well-stocked future.</p>
            </div>
            <Leaf size={28} />
          </div>
          <div className="start-steps">
            {can('manageInventory') && (
              <Link to="/inventory?action=add">
                <span className={inventory.products ? 'step done' : 'step'}>
                  {inventory.products ? <CheckCircle2 size={16} /> : <Package size={16} />}
                </span>
                <div>
                  <strong>Build your spice catalog</strong>
                  <small>Add products, prices and opening stock.</small>
                </div>
                <ArrowRight size={16} />
              </Link>
            )}
            {can('manageCustomers') && (
              <Link to="/customers?action=add">
                <span className="step">
                  <Users size={16} />
                </span>
                <div>
                  <strong>Bring your trade accounts together</strong>
                  <small>Customer details, terms and pricing.</small>
                </div>
                <ArrowRight size={16} />
              </Link>
            )}
            {can('scan') && (
              <Link to="/scan">
                <span className="step">
                  <ScanLine size={16} />
                </span>
                <div>
                  <strong>Let a scan do the work</strong>
                  <small>Look up products and print your labels.</small>
                </div>
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </Card>
      </div>
      {restock && (
        <StockForm
          product={restock}
          onClose={() => setRestock(null)}
          onSaved={() => {
            setRestock(null);
            reload();
          }}
        />
      )}
    </>
  );
}
