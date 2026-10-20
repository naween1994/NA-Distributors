import { useState } from 'react';
import {
  Download,
  FileCheck2,
  ArrowUpRight,
  ExternalLink,
  History,
  Info,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';
import { useData } from '../hooks';
import { useApp } from '../context';
import { download, displayDate, today, addDays } from '../api';
import { PageHeader, Card, Button, Field, Empty, Loading, ErrorBox } from '../components/ui';
export default function Accounting() {
  const { toast } = useApp();
  const [start, setStart] = useState(addDays(today(), -29)),
    [end, setEnd] = useState(today()),
    [busy, setBusy] = useState('');
  const { data, loading, error, reload } =
    useData<
      {
        id: number;
        provider: string;
        action: string;
        status: string;
        detail: string;
        user_name: string;
        created_at: string;
      }[]
    >('/accounting/history');
  const exportData = async (provider: string) => {
    setBusy(provider);
    try {
      await download(
        '/accounting/export/' + provider + '?' + new URLSearchParams({ start, end }),
        provider === 'xero' ? 'NA-xero-invoices.csv' : 'NA-quickbooks-style-invoices.json',
      );
      toast('Accounting export downloaded. No records sent to a provider.');
      reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="READY FOR THE BOOKS"
        title="Your numbers, ready to travel."
        description="Prepare clear accounting exports from your saved sales records."
      />
      <div className="integration-notice">
        <Info size={22} />
        <div>
          <strong>File exports. No live accounting connection.</strong>
          <p>
            QuickBooks and Xero are not authenticated or synced. Download a file, review mappings,
            then import it in your accounting software.
          </p>
        </div>
        <span className="subtle-pill">EXPORT ONLY</span>
      </div>
      <Card className="accounting-date-bar">
        <CalendarDays size={21} />
        <strong>Invoices to include</strong>
        <Field label="From">
          <input
            type="date"
            required
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            required
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </Card>
      <div className="accounting-grid">
        <Card className="provider-card">
          <div className="provider-logo qb">qb</div>
          <span className="eyebrow">QUICKBOOKS-STYLE</span>
          <h2>A structured handover.</h2>
          <p>
            Invoice JSON with customers, item lines, discounts, totals and outstanding balances.
          </p>
          <div className="provider-details">
            <span>
              <CheckCircle2 size={15} />
              Order and due dates included
            </span>
            <span>
              <CheckCircle2 size={15} />
              Historical invoice prices preserved
            </span>
            <span>
              <Info size={15} />
              Map customer, item and account IDs before import
            </span>
          </div>
          <Button
            disabled={!!busy || !start || !end || start > end}
            onClick={() => void exportData('quickbooks')}
          >
            <Download size={16} />
            {busy === 'quickbooks' ? 'Exporting…' : 'Download JSON'}
          </Button>
          <small>
            This format needs adaptation for your QuickBooks company. It does not post to the
            QuickBooks API.
          </small>
        </Card>
        <Card className="provider-card">
          <div className="provider-logo xero">xero</div>
          <span className="eyebrow">XERO CSV</span>
          <h2>From your sales to your books.</h2>
          <p>A line-by-line invoice CSV, ready for review in your accounting workflow.</p>
          <div className="provider-details">
            <span>
              <CheckCircle2 size={15} />
              Customer, product and currency fields
            </span>
            <span>
              <CheckCircle2 size={15} />
              Quantity, unit price and discount percentage
            </span>
            <span>
              <Info size={15} />
              Choose account codes and verify your tax mapping
            </span>
          </div>
          <Button
            disabled={!!busy || !start || !end || start > end}
            onClick={() => void exportData('xero')}
          >
            <Download size={16} />
            {busy === 'xero' ? 'Exporting…' : 'Download CSV'}
          </Button>
          <small>
            AccountCode is left blank. Review account codes, dates, discounts and tax labels before
            importing.
          </small>
        </Card>
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Accounting activity</h2>
            <p>Exports prepared by your team. Exported does not mean synced.</p>
          </div>
          <History size={20} />
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DATE / USER</th>
                  <th>FORMAT</th>
                  <th>ACTION</th>
                  <th>DETAILS</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {displayDate(l.created_at)}
                      <small>{l.user_name || 'Deleted user'}</small>
                    </td>
                    <td>{l.provider === 'xero' ? 'Xero CSV' : 'QuickBooks-style JSON'}</td>
                    <td>{l.action}</td>
                    <td>{l.detail}</td>
                    <td>
                      <span className="badge healthy">Exported</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            compact
            icon={<FileCheck2 size={25} />}
            title="A clean start for your accounting"
            description="Export history will appear here when you download a file."
          />
        )}
      </Card>
    </>
  );
}
