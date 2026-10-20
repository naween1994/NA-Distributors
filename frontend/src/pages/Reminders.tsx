import { useState } from 'react';
import { Mail, MessageSquare, Copy, FileText, Check, Clock3, Settings2 } from 'lucide-react';
import { useApp } from '../context';
import { useData } from '../hooks';
import type { Order } from '../types';
import { post, put, money, displayDate, today } from '../api';
import {
  PageHeader,
  Card,
  Button,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  Field,
  Select,
  Status,
} from '../components/ui';
import { PaymentForm } from './Orders';
export default function Reminders() {
  const { settings, can, toast, reloadSettings } = useApp();
  const { data, loading, error, reload } = useData<Order[]>('/reminders');
  const history =
    useData<
      {
        id: number;
        invoice: string;
        channel: string;
        recipient: string;
        message: string;
        user_name: string;
        created_at: string;
      }[]
    >('/reminders/history');
  const [selected, setSelected] = useState<Order | null>(null),
    [channel, setChannel] = useState('email'),
    [recipient, setRecipient] = useState(''),
    [message, setMessage] = useState(''),
    [payment, setPayment] = useState<Order | null>(null),
    [templates, setTemplates] = useState(false),
    [email, setEmail] = useState(settings?.reminderEmail || ''),
    [sms, setSms] = useState(settings?.reminderSms || ''),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState('');
  const render = (template: string, o: Order) =>
    template
      .replaceAll('{customer}', o.customer.business)
      .replaceAll('{invoice}', o.invoice)
      .replaceAll('{balance}', money(o.balance))
      .replaceAll('{dueDate}', displayDate(o.due_date));
  function choose(o: Order, c = channel) {
    setSelected(o);
    setChannel(c);
    setRecipient(c === 'email' ? o.customer.email : o.customer.phone);
    setMessage(render(c === 'email' ? settings!.reminderEmail : settings!.reminderSms, o));
    setFormError('');
  }
  return (
    <>
      <PageHeader
        eyebrow="A FRIENDLY FOLLOW-UP"
        title="Keep payments moving."
        description="Clear balances, thoughtful reminders, healthier trade accounts."
      >
        {can('manageSettings') && (
          <Button variant="secondary" onClick={() => setTemplates(true)}>
            <Settings2 size={16} />
            Edit templates
          </Button>
        )}
      </PageHeader>
      <div className="integration-notice">
        <Mail size={21} />
        <div>
          <strong>Prepare the message. Send it with your own app.</strong>
          <p>
            No email or SMS provider is connected. Reminders are saved as drafts; this app does not
            deliver them.
          </p>
        </div>
        <span className="subtle-pill">DRAFTS ONLY</span>
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Open invoices</h2>
            <p>Upcoming and overdue balances, ordered by due date.</p>
          </div>
          <span className="count-pill">{data?.length || 0}</span>
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
                  <th>INVOICE / CUSTOMER</th>
                  <th>DUE DATE</th>
                  <th>BALANCE</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.invoice}</strong>
                      <small>{o.customer.business}</small>
                    </td>
                    <td>
                      {displayDate(o.due_date)}
                      <small>
                        {o.due_date < today() ? 'Payment is overdue' : 'Upcoming payment'}
                      </small>
                    </td>
                    <td>{money(o.balance)}</td>
                    <td>
                      <Status value={o.status} overdue={o.overdue} />
                    </td>
                    <td>
                      <div className="inline-actions">
                        <Button variant="secondary" onClick={() => choose(o)}>
                          <Mail size={15} />
                          Prepare reminder
                        </Button>
                        {can('managePayments') && (
                          <button className="text-button" onClick={() => setPayment(o)}>
                            Record payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<Check size={28} />}
            title="A little peace of mind."
            description="There are no outstanding invoices to follow up. Open balances will appear here."
          />
        )}
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Prepared reminder history</h2>
            <p>A database record of your drafts. These are not delivery receipts.</p>
          </div>
          <Clock3 size={19} />
        </div>
        {history.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PREPARED</th>
                  <th>INVOICE</th>
                  <th>CHANNEL / RECIPIENT</th>
                  <th>MESSAGE</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {displayDate(h.created_at)}
                      <small>{h.user_name || 'Deleted user'}</small>
                    </td>
                    <td>{h.invoice}</td>
                    <td>
                      {h.channel}
                      <small>{h.recipient || 'No recipient specified'}</small>
                    </td>
                    <td className="message-cell">{h.message}</td>
                    <td>
                      <span className="badge pending">Draft · not sent</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            compact
            icon={<FileText size={23} />}
            title="No reminders prepared yet"
            description="Create a draft from an open invoice above."
          />
        )}
      </Card>
      {selected && (
        <Modal
          title={'Reminder · ' + selected.invoice}
          subtitle="Edit the message, then copy it to your email or SMS app."
          onClose={() => setSelected(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setFormError('');
              try {
                await post('/reminders/' + selected.id + '/log', { channel, recipient, message });
                toast('Reminder draft saved. No message was sent.');
                setSelected(null);
                history.reload();
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Channel">
                <Select value={channel} onChange={(e) => choose(selected, e.target.value)}>
                  <option value="email">Email draft</option>
                  <option value="sms">SMS draft</option>
                </Select>
              </Field>
              <Field label={channel === 'email' ? 'Email recipient' : 'Phone recipient'}>
                <input
                  type={channel === 'email' ? 'email' : 'tel'}
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  maxLength={200}
                />
              </Field>
            </div>
            <Field label="Reminder message">
              <textarea
                rows={7}
                required
                maxLength={5000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <Button
              variant="secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  toast('Message copied. Paste it into your email or SMS app.');
                } catch {
                  toast('Clipboard unavailable. Select and copy the message above.', 'error');
                }
              }}
            >
              <Copy size={15} />
              Copy message
            </Button>
            <div className="info-box">
              <Mail size={18} />
              <span>Saving records this draft in the database. It does not send a message.</span>
            </div>
            {formError && <p className="form-error">{formError}</p>}
            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button disabled={busy || !can('managePayments')}>
                {busy ? 'Saving…' : 'Save reminder draft'}
              </Button>
            </div>
            {!can('managePayments') && (
              <p className="muted small">
                Your role can prepare and copy text. Recording a reminder requires payment
                management permission.
              </p>
            )}
          </form>
        </Modal>
      )}
      {templates && (
        <Modal
          title="Payment reminder templates"
          subtitle="Use {customer}, {invoice}, {balance} and {dueDate} placeholders."
          wide
          onClose={() => setTemplates(false)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await put('/settings', { reminderEmail: email, reminderSms: sms });
                await reloadSettings();
                toast('Reminder templates saved.');
                setTemplates(false);
              } catch (e) {
                toast((e as Error).message, 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Email template">
              <textarea
                rows={5}
                maxLength={2000}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="SMS template">
              <textarea
                rows={3}
                maxLength={2000}
                value={sms}
                onChange={(e) => setSms(e.target.value)}
              />
            </Field>
            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={() => setTemplates(false)}>
                Cancel
              </Button>
              <Button disabled={busy}>Save templates</Button>
            </div>
          </form>
        </Modal>
      )}
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
    </>
  );
}
