import { useState } from 'react';
import {
  Plus,
  UsersRound,
  ShieldCheck,
  Pencil,
  Trash2,
  KeyRound,
  CheckCircle2,
  UserRound,
  Activity,
} from 'lucide-react';
import { useApp } from '../context';
import { useData } from '../hooks';
import type { User } from '../types';
import { post, put, remove, initials, displayDate } from '../api';
import {
  PageHeader,
  Card,
  Button,
  Modal,
  Field,
  Select,
  SaveFooter,
  ConfirmDelete,
  Loading,
  ErrorBox,
} from '../components/ui';
interface UsersData {
  users: User[];
  roles: Record<string, string[]>;
  permissions: string[];
}
const roleName = (role: string) =>
  ({
    admin: 'Administrator',
    inventory: 'Inventory manager',
    sales: 'Sales representative',
    accountant: 'Accountant',
  })[role] || role;
export const permissionName = (value: string) =>
  value.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
function UserForm({
  editing,
  meta,
  onClose,
  onSaved,
}: {
  editing?: User;
  meta: UsersData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useApp();
  const [name, setName] = useState(editing?.name || ''),
    [username, setUsername] = useState(editing?.username || ''),
    [role, setRole] = useState(editing?.role || 'sales'),
    [active, setActive] = useState(editing?.active ?? true),
    [password, setPassword] = useState(''),
    [custom, setCustom] = useState(
      !!editing &&
        JSON.stringify([...editing.permissions].sort()) !==
          JSON.stringify([...(meta.roles[editing.role] || [])].sort()),
    ),
    [permissions, setPermissions] = useState<string[]>(editing?.permissions || meta.roles.sales),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const toggle = (p: string) => {
    const dependencies: Record<string, string[]> = {
      manageInventory: ['viewInventory'],
      deleteProducts: ['viewInventory'],
      resetCatalog: ['viewInventory'],
      manageCustomers: ['viewCustomers'],
      createOrders: ['viewOrders', 'viewCustomers', 'viewInventory'],
      managePayments: ['viewOrders'],
      deleteOrders: ['viewOrders'],
      scan: ['viewInventory'],
    };
    setPermissions((old) =>
      old.includes(p)
        ? old.filter((x) => x !== p)
        : [...new Set([...old, p, ...(dependencies[p] || [])])],
    );
  };
  return (
    <Modal
      title={editing ? 'Edit team member' : 'Add a team member'}
      subtitle="The right access for the work they do."
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
            const body = {
              name,
              username,
              role,
              active,
              password: password || undefined,
              permissions: custom ? permissions : null,
            };
            if (editing) await put('/users/' + editing.id, body);
            else await post('/users', body);
            toast(
              password
                ? 'User saved. They must change their temporary password when signing in.'
                : 'Team member updated.',
            );
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Full name">
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Username">
            <input
              required
              maxLength={80}
              pattern="[a-zA-Z0-9._-]+"
              autoComplete="off"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Role">
            <Select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPermissions(meta.roles[e.target.value]);
              }}
            >
              {Object.keys(meta.roles).map((r) => (
                <option key={r} value={r}>
                  {roleName(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={
              editing?.passwordSet ? 'New temporary password (optional)' : 'Set temporary password'
            }
            hint="10+ characters. Share securely; the user must change it at first sign-in."
          >
            <input
              type="password"
              minLength={10}
              maxLength={200}
              autoComplete="new-password"
              required={!editing?.passwordSet}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>
        <div className="user-options">
          <label className="checkbox-label">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Account is active
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => {
                setCustom(e.target.checked);
                if (!e.target.checked) setPermissions(meta.roles[role]);
              }}
            />
            Customize role permissions
          </label>
        </div>
        <div className="permissions-grid">
          {meta.permissions.map((p) => (
            <label
              key={p}
              className={permissions.includes(p) ? 'permission granted' : 'permission'}
            >
              <input
                type="checkbox"
                disabled={!custom}
                checked={permissions.includes(p)}
                onChange={() => toggle(p)}
              />
              {permissionName(p)}
            </label>
          ))}
        </div>
        {error && <div className="form-error">{error}</div>}
        <SaveFooter
          busy={busy}
          onClose={onClose}
          label={editing ? 'Save team member' : 'Create user'}
        />
      </form>
    </Modal>
  );
}
export default function Users() {
  const { user, toast } = useApp();
  const { data, loading, error, reload } = useData<UsersData>('/users');
  const activity =
    useData<
      { id: number; user_name: string; action: string; detail: string; created_at: string }[]
    >('/activity');
  const [form, setForm] = useState<User | 'new' | null>(null),
    [deleting, setDeleting] = useState<User | null>(null);
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE BEHIND THE BUSINESS"
        title="Your team. The right access."
        description="Keep work flowing, with permissions that fit each role."
      >
        <Button onClick={() => setForm('new')}>
          <Plus size={17} />
          Add team member
        </Button>
      </PageHeader>
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBox message={error} retry={reload} />
      ) : (
        <>
          <div className="team-grid">
            {data.users.map((u) => (
              <Card className="team-card" key={u.id}>
                <div className="team-card-top">
                  <span className={'team-avatar ' + u.role}>{initials(u.name)}</span>
                  <span className={'badge ' + (u.active && u.passwordSet ? 'healthy' : 'pending')}>
                    <span className="badge-dot" />
                    {!u.active ? 'Disabled' : u.passwordSet ? 'Active' : 'Awaiting password'}
                  </span>
                </div>
                <h2>
                  {u.name}
                  {u.id === user!.id && <span className="you-badge">YOU</span>}
                </h2>
                <p>@{u.username}</p>
                <div className="team-role">
                  <ShieldCheck size={15} />
                  {roleName(u.role)}
                </div>
                <div className="team-permissions">
                  <strong>{u.permissions.length}</strong> permissions
                  {u.mustChangePassword && (
                    <span>
                      <KeyRound size={13} /> Password change required
                    </span>
                  )}
                </div>
                <div className="team-card-actions">
                  <Button variant="secondary" onClick={() => setForm(u)}>
                    <Pencil size={15} />
                    {u.passwordSet ? 'Edit access' : 'Set password & access'}
                  </Button>
                  {u.id !== user!.id && (
                    <button
                      className="icon-button danger-text"
                      aria-label={'Delete ' + u.name}
                      onClick={() => setDeleting(u)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <Card className="role-guide">
            <div className="card-heading">
              <div>
                <h2>Access that follows responsibility</h2>
                <p>Role defaults can be customized for each team member.</p>
              </div>
              <ShieldCheck size={23} />
            </div>
            <div className="role-guide-grid">
              {Object.entries(data.roles).map(([r, p]) => (
                <div key={r}>
                  <strong>{roleName(r)}</strong>
                  <p>
                    {r === 'admin'
                      ? 'Complete business access, settings and team management.'
                      : r === 'inventory'
                        ? 'Products, cost pricing, stock receipts and barcode tools.'
                        : r === 'sales'
                          ? 'Customer accounts, orders, payment collection and scanning.'
                          : 'Reports, customer balances, payment collection and accounting exports.'}
                  </p>
                  <span>{p.length} permissions</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="card-heading">
              <div>
                <h2>Recent workspace activity</h2>
                <p>A record of changes made by your team.</p>
              </div>
              <Activity size={19} />
            </div>
            <div className="activity-list">
              {activity.data?.length ? (
                activity.data.slice(0, 15).map((a) => (
                  <div key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{a.action.replaceAll('.', ' · ')}</strong>
                      <p>{a.detail}</p>
                      <small>
                        {a.user_name || 'Deleted user'} · {displayDate(a.created_at)}
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">Changes to records and settings will appear here.</p>
              )}
            </div>
          </Card>
        </>
      )}
      {form && data && (
        <UserForm
          editing={form === 'new' ? undefined : form}
          meta={data}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            reload();
            activity.reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title={'Delete ' + deleting.name + '?'}
          description="Their account and sessions will be removed. Business records and the activity history remain."
          onClose={() => setDeleting(null)}
          onConfirm={async (password) => {
            await remove('/users/' + deleting.id, { adminPassword: password });
            toast('Team member removed.');
            reload();
            activity.reload();
          }}
        />
      )}
    </>
  );
}
