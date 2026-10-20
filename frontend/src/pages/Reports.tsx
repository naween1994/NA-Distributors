import { useState } from 'react';
import {
  TrendingUp,
  Wallet,
  HandCoins,
  ChartNoAxesCombined,
  Download,
  CalendarDays,
  FileText,
  Leaf,
  Users,
} from 'lucide-react';
import { useApp } from '../context';
import { useData } from '../hooks';
import type { Report } from '../types';
import { api, money, today, addDays, displayDate, count } from '../api';
import {
  PageHeader,
  Button,
  Card,
  Select,
  Field,
  StatCard,
  Loading,
  ErrorBox,
  Empty,
  ExportButton,
  Modal,
} from '../components/ui';
import { SalesChart, ProgressBar } from '../components/Charts';
export default function Reports() {
  const { toast, can, settings } = useApp();
  const [preset, setPreset] = useState('30'),
    [start, setStart] = useState(addDays(today(), -29)),
    [end, setEnd] = useState(today()),
    [tab, setTab] = useState('products'),
    [pdfOpen, setPdfOpen] = useState(false),
    [month, setMonth] = useState(today().slice(0, 7)),
    [pdfBusy, setPdfBusy] = useState(false);
  const query = new URLSearchParams({ start, end });
  const { data, loading, error, reload } = useData<Report>('/reports?' + query);
  const choose = (p: string) => {
    setPreset(p);
    if (p !== 'custom') {
      setStart(p === 'all' ? '0001-01-01' : addDays(today(), 1 - Number(p)));
      setEnd(today());
    }
  };
  const monthlyPdf = async () => {
    setPdfBusy(true);
    try {
      const start = month + '-01';
      const d = new Date(start + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(0);
      const end = d.toISOString().slice(0, 10);
      const report = await api<Report>('/reports?' + new URLSearchParams({ start, end }));
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF();
      doc.setFontSize(21);
      doc.setTextColor('#245b45');
      doc.text(settings?.appName || 'NA Distributors', 14, 22);
      doc.setFontSize(11);
      doc.setTextColor('#5d6962');
      doc.text(
        'Monthly business statement | ' + displayDate(start) + ' – ' + displayDate(end),
        14,
        32,
      );
      autoTable(doc, {
        startY: 41,
        head: [['Measure', 'LKR / count']],
        body: [
          ['Sales revenue', money(report.summary.revenue)],
          ['Recorded collections in month', money(report.summary.collected)],
          ['Outstanding on month’s invoices', money(report.summary.outstanding)],
          ...(can('viewCosts')
            ? [
                ['Cost of goods sold', money(report.summary.cogs)],
                ['Gross profit', money(report.summary.grossProfit)],
                ['Gross margin', (report.summary.margin || 0).toFixed(2) + '%'],
              ]
            : []),
          ['Orders', String(report.summary.orders)],
        ],
        headStyles: { fillColor: [36, 91, 69] },
        styles: { fontSize: 9 },
      });
      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12,
        head: [
          [
            'Product',
            'Units',
            'Net revenue',
            ...(can('viewCosts') ? ['Cost', 'Gross profit'] : []),
          ],
        ],
        body: report.products.map((p) => [
          p.name,
          String(p.quantity),
          money(p.revenue),
          ...(can('viewCosts') ? [money(p.cost), money(p.profit)] : []),
        ]),
        headStyles: { fillColor: [36, 91, 69] },
        styles: { fontSize: 8 },
      });
      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12,
        head: [['Customer', 'Orders', 'Net revenue', 'Current outstanding']],
        body: report.customers.map((c) => [
          c.name,
          String(c.orders),
          money(c.revenue),
          money(c.outstanding),
        ]),
        headStyles: { fillColor: [36, 91, 69] },
        styles: { fontSize: 8 },
      });
      doc.setFontSize(8);
      doc.text(
        'No tax added. Collections use payment dates; balances reflect all recorded payments.',
        14,
        doc.internal.pageSize.height - 12,
      );
      doc.save('NA-statement-' + month + '.pdf');
      toast('Monthly statement downloaded.');
      setPdfOpen(false);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setPdfBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="THE BIGGER PICTURE"
        title="Reports & insights"
        description="A clearer look at what’s working, and what’s next."
      >
        <ExportButton
          path={'/reports/export?' + query + '&section=' + tab}
          name="na-sales-report.csv"
        />
        <Button onClick={() => setPdfOpen(true)}>
          <FileText size={16} />
          Monthly statement
        </Button>
      </PageHeader>
      <Card className="date-filter-bar">
        <div>
          <CalendarDays size={18} />
          <strong>Reporting period</strong>
        </div>
        <div className="date-filter-controls">
          <div className="segmented">
            {[
              ['7', '7 days'],
              ['30', '30 days'],
              ['90', '90 days'],
              ['all', 'All time'],
            ].map(([v, l]) => (
              <button key={v} className={preset === v ? 'active' : ''} onClick={() => choose(v)}>
                {l}
              </button>
            ))}
          </div>
          <label>
            <span className="sr-only">Start date</span>
            <input
              type="date"
              value={start}
              max={end}
              onChange={(e) => {
                setPreset('custom');
                setStart(e.target.value);
              }}
            />
          </label>
          <span>to</span>
          <label>
            <span className="sr-only">End date</span>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => {
                setPreset('custom');
                setEnd(e.target.value);
              }}
            />
          </label>
        </div>
      </Card>
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBox message={error} retry={reload} />
      ) : (
        <>
          <div className="stats-grid">
            <StatCard
              label="Net sales revenue"
              value={money(data.summary.revenue)}
              detail={`${data.summary.orders} invoices in selected period`}
              icon={<Wallet size={20} />}
              highlight
            />
            <StatCard
              label={can('viewCosts') ? 'Gross profit' : 'Units sold'}
              value={can('viewCosts') ? money(data.summary.grossProfit) : count(data.summary.units)}
              detail={
                can('viewCosts')
                  ? (data.summary.margin || 0).toFixed(1) + '% gross margin'
                  : 'Across the selected orders'
              }
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              label="Payments collected"
              value={money(data.summary.collected)}
              detail="By payment date within period"
              icon={<HandCoins size={20} />}
            />
            <StatCard
              label="Outstanding balance"
              value={money(data.summary.outstanding)}
              detail="Current balance on selected invoices"
              icon={<FileText size={20} />}
            />
          </div>
          {can('viewCosts') && (
            <div className="report-formula">
              <CalculatorIcon />
              <span>
                Gross profit = net revenue {money(data.summary.revenue)} − cost of goods{' '}
                {money(data.summary.cogs)} = <strong>{money(data.summary.grossProfit)}</strong>
              </span>
              <small>Costs are captured when each order is placed.</small>
            </div>
          )}
          <Card className="report-chart">
            <div className="card-heading">
              <div>
                <h2>Weekly sales trends</h2>
                <p>Net revenue, after discounts.</p>
              </div>
              <span className="subtle-pill">{data.summary.units} units sold</span>
            </div>
            <SalesChart data={data.weeks} />
          </Card>
          <Card>
            <div className="tabs">
              <button
                className={tab === 'products' ? 'active' : ''}
                onClick={() => setTab('products')}
              >
                <Leaf size={16} />
                Product performance
              </button>
              <button
                className={tab === 'customers' ? 'active' : ''}
                onClick={() => setTab('customers')}
              >
                <Users size={16} />
                Customer purchases
              </button>
              <button className={tab === 'weeks' ? 'active' : ''} onClick={() => setTab('weeks')}>
                <TrendingUp size={16} />
                Weekly breakdown
              </button>
            </div>
            {tab === 'products' ? (
              data.products.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>PRODUCT / SKU</th>
                        <th>UNITS SOLD</th>
                        <th>NET REVENUE</th>
                        {can('viewCosts') && (
                          <>
                            <th>COST OF GOODS</th>
                            <th>GROSS PROFIT</th>
                            <th>MARGIN</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p) => (
                        <tr key={p.sku}>
                          <td>
                            <strong>{p.name}</strong>
                            <small>{p.sku}</small>
                          </td>
                          <td>{p.quantity}</td>
                          <td>{money(p.revenue)}</td>
                          {can('viewCosts') && (
                            <>
                              <td>{money(p.cost)}</td>
                              <td className={(p.profit || 0) < 0 ? 'danger-text' : 'text-green'}>
                                {money(p.profit)}
                              </td>
                              <td>
                                <div className="margin-cell">
                                  <span>{(p.margin || 0).toFixed(1)}%</span>
                                  <ProgressBar value={Math.max(0, p.margin || 0)} max={100} />
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={<ChartNoAxesCombined size={26} />}
                  title="Insight begins with the first sale"
                  description="There are no orders in this date range. Try a different period or create an order."
                />
              )
            ) : tab === 'customers' ? (
              data.customers.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>CUSTOMER</th>
                        <th>ORDERS</th>
                        <th>NET REVENUE</th>
                        <th>COLLECTED ON INVOICES</th>
                        <th>CURRENT BALANCE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customers.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>{c.orders}</td>
                          <td>{money(c.revenue)}</td>
                          <td>{money(c.collected)}</td>
                          <td>{money(c.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty compact title="No customer purchases in this period" />
              )
            ) : data.weeks.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>WEEK COMMENCING</th>
                      <th>ORDERS</th>
                      <th>NET REVENUE</th>
                      {can('viewCosts') && (
                        <>
                          <th>COST</th>
                          <th>GROSS PROFIT</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeks.map((w) => (
                      <tr key={w.week}>
                        <td>{displayDate(w.week)}</td>
                        <td>{w.orders}</td>
                        <td>{money(w.revenue)}</td>
                        {can('viewCosts') && (
                          <>
                            <td>{money(w.cost)}</td>
                            <td>{money(w.profit)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty compact title="No weekly activity yet" />
            )}
          </Card>
          <div className="page-note">
            <span>
              Revenue follows order dates. Collections follow payment dates. Outstanding balances
              include later payments.
            </span>
          </div>
        </>
      )}
      {pdfOpen && (
        <Modal
          title="Monthly PDF statement"
          subtitle="A shareable summary of sales, margins and customer balances."
          onClose={() => setPdfOpen(false)}
        >
          <div className="modal-body">
            <Field label="Statement month">
              <input
                type="month"
                required
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </Field>
            <div className="info-box">
              <FileText size={19} />
              <span>
                The statement is generated from database records for the selected calendar month.
              </span>
            </div>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setPdfOpen(false)}>
                Cancel
              </Button>
              <Button disabled={pdfBusy || !month} onClick={() => void monthlyPdf()}>
                <Download size={16} />
                {pdfBusy ? 'Generating…' : 'Download PDF'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function CalculatorIcon() {
  return <span className="formula-icon">=</span>;
}
