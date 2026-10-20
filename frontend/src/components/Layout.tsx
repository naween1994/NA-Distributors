import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ScanLine,
  Users,
  ShoppingBag,
  ChartNoAxesCombined,
  Settings,
  UsersRound,
  Bell,
  PanelLeftClose,
  LogOut,
  ChevronDown,
  Search,
  Plus,
  Leaf,
  Menu,
  X,
  Smartphone,
  FileCheck2,
  Mail,
  KeyRound,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context';
import { api, post, initials, today } from '../api';
import type { Notification, User } from '../types';
import { Button, Modal, Field } from './ui';
const nav = [
  {
    label: 'WORKSPACE',
    items: [
      { to: '/', name: 'Dashboard', icon: LayoutDashboard, permission: 'viewDashboard' },
      { to: '/inventory', name: 'Spice inventory', icon: Package, permission: 'viewInventory' },
      { to: '/scan', name: 'Scan & labels', icon: ScanLine, permission: 'scan' },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      { to: '/customers', name: 'Customers', icon: Users, permission: 'viewCustomers' },
      { to: '/orders', name: 'Sales orders', icon: ShoppingBag, permission: 'viewOrders' },
      {
        to: '/reports',
        name: 'Reports & insights',
        icon: ChartNoAxesCombined,
        permission: 'viewReports',
      },
      { to: '/reminders', name: 'Payment reminders', icon: Mail, permission: 'viewOrders' },
      { to: '/accounting', name: 'Accounting', icon: FileCheck2, permission: 'accounting' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { to: '/users', name: 'Team & access', icon: UsersRound, permission: 'manageUsers' },
      { to: '/settings', name: 'Settings', icon: Settings, permission: 'manageSettings' },
      { to: '/mobile', name: 'Mobile workspace', icon: Smartphone, permission: '' },
    ],
  },
];
export function PasswordForm({
  required = false,
  onClose,
}: {
  required?: boolean;
  onClose?: () => void;
}) {
  const { authenticate, toast } = useApp();
  const [currentPassword, setCurrent] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const content = (
    <form
      className="modal-body"
      onSubmit={async (e) => {
        e.preventDefault();
        setError('');
        if (password !== confirm) {
          setError('Passwords do not match.');
          return;
        }
        setBusy(true);
        try {
          await authenticate(
            await post<{ user: User; csrf: string }>('/auth/password', {
              currentPassword,
              password,
            }),
          );
          toast('Your password has been changed.');
          onClose?.();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {required && (
        <div className="info-box">
          <ShieldCheck size={20} />
          <span>Choose a personal password before using your account.</span>
        </div>
      )}
      <Field label="Current password">
        <input
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label="New password" hint="At least 10 characters.">
        <input
          type="password"
          minLength={10}
          maxLength={200}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password">
        <input
          type="password"
          minLength={10}
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        {onClose && (
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
      </div>
    </form>
  );
  return required ? (
    <div className="password-required">
      <div className="card">
        <div className="modal-heading">
          <h2>Make your account secure</h2>
        </div>
        {content}
      </div>
    </div>
  ) : (
    <Modal title="Change your password" onClose={onClose!}>
      {content}
    </Modal>
  );
}
export default function Layout() {
  const { user, settings, can, logout, toast } = useApp();
  const location = useLocation(),
    navigate = useNavigate();
  const [mobile, setMobile] = useState(false),
    [profile, setProfile] = useState(false),
    [password, setPassword] = useState(false),
    [notifications, setNotifications] = useState<Notification[]>([]),
    [notificationOpen, setNotificationOpen] = useState(false),
    [search, setSearch] = useState('');
  useEffect(() => {
    setMobile(false);
    setProfile(false);
    setNotificationOpen(false);
    setSearch('');
  }, [location.pathname]);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Notification[]>('/notifications')
        .then((n) => {
          if (active) setNotifications(n);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [location.pathname]);
  const title =
    nav
      .flatMap((g) => g.items)
      .find((n) => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)))
      ?.name || 'Workspace';
  const unread = notifications.filter((n) => !n.is_read).length;
  const signOut = async () => {
    try {
      await logout();
      navigate('/');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="app-layout">
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={'sidebar ' + (mobile ? 'open' : '')}>
        <NavLink to="/" className="brand">
          <span className="brand-mark">
            <Leaf size={25} />
          </span>
          <div>
            NA <strong>Distributors</strong>
            <small>THE SPICE BUSINESS, SIMPLIFIED</small>
          </div>
        </NavLink>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-picker">
          <span className="workspace-avatar">NA</span>
          <div>
            <strong>{settings?.appName || 'NA Distributors'}</strong>
            <small>
              <span className="live-dot" /> Business workspace
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav>
          {nav.map((group) => {
            const items = group.items.filter((i) => !i.permission || can(i.permission));
            return items.length ? (
              <div className="nav-group" key={group.label}>
                <div className="nav-label">{group.label}</div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => 'nav-link ' + (isActive ? 'active' : '')}
                  >
                    <item.icon size={18} />
                    <span>{item.name}</span>
                    {item.to === '/scan' && <span className="nav-pill">QUICK</span>}
                  </NavLink>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="database-status">
            <span className="live-dot" />
            <span>Database connected</span>
            <ShieldCheck size={14} />
          </div>
          <div className="sidebar-user">
            <span className="avatar">{initials(user!.name)}</span>
            <div>
              <strong>{user!.name.split(' ')[0]}</strong>
              <small>
                {user!.role === 'admin'
                  ? 'Administrator'
                  : user!.role === 'inventory'
                    ? 'Inventory manager'
                    : user!.role === 'sales'
                      ? 'Sales representative'
                      : 'Accountant'}
              </small>
            </div>
            <button className="icon-button" aria-label="Sign out" onClick={() => void signOut()}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </button>
            <PanelLeftClose className="desktop-menu" size={17} />
            <span className="breadcrumb-workspace">Workspace</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            {can('viewInventory') && (
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate('/inventory?q=' + encodeURIComponent(search));
                }}
              >
                <Search size={16} />
                <input
                  aria-label="Search inventory"
                  placeholder="Search inventory…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
            )}
            <div className="notification-container">
              <button
                className={
                  'icon-button notification-button ' + (notificationOpen ? 'selected' : '')
                }
                aria-label={`Notifications${unread ? ' (' + unread + ' unread)' : ''}`}
                onClick={() => {
                  setNotificationOpen(!notificationOpen);
                  setProfile(false);
                }}
              >
                <Bell size={20} />
                {unread > 0 && <i />}
              </button>
              {notificationOpen && (
                <div className="notification-panel">
                  <div className="popover-heading">
                    <strong>
                      Notifications {unread > 0 && <span className="count-pill">{unread}</span>}
                    </strong>
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await post('/notifications/read', {
                            ids: notifications.map((n) => n.id),
                          });
                          setNotifications((n) => n.map((x) => ({ ...x, is_read: 1 })));
                        } catch (e) {
                          toast((e as Error).message, 'error');
                        }
                      }}
                    >
                      Mark all read
                    </button>
                  </div>
                  {notifications.length ? (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        className={'notification-item ' + (!n.is_read ? 'unread' : '')}
                        onClick={async () => {
                          try {
                            await post('/notifications/read', { ids: [n.id] });
                            setNotifications((a) =>
                              a.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)),
                            );
                            navigate(n.link);
                          } catch (e) {
                            toast((e as Error).message, 'error');
                          }
                        }}
                      >
                        <span className="notification-symbol">
                          <Bell size={17} />
                        </span>
                        <span>
                          <strong>{n.title}</strong>
                          <small>{n.message}</small>
                        </span>
                        <ArrowUpRight size={14} />
                      </button>
                    ))
                  ) : (
                    <div className="notification-empty">
                      <Bell size={25} />
                      <strong>You’re all caught up</strong>
                      <p>Business updates will appear here.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <div className="profile-container">
              <button
                className="profile-button"
                aria-label="Account menu"
                onClick={() => {
                  setProfile(!profile);
                  setNotificationOpen(false);
                }}
              >
                <span className="avatar small-avatar">{initials(user!.name)}</span>
                <ChevronDown size={14} />
              </button>
              {profile && (
                <div className="profile-menu">
                  <strong>{user!.name}</strong>
                  <small>@{user!.username}</small>
                  <button
                    onClick={() => {
                      setPassword(true);
                      setProfile(false);
                    }}
                  >
                    <KeyRound size={16} /> Change password
                  </button>
                  <button onClick={() => void signOut()}>
                    <Users size={16} /> Switch user
                  </button>
                  <button onClick={() => void signOut()}>
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>
            NA Distributors <i /> Your everyday business, connected.
          </span>
          <span>
            All amounts in LKR <i /> {today().slice(0, 4)}
          </span>
        </footer>
      </div>
      {password && <PasswordForm onClose={() => setPassword(false)} />}
    </div>
  );
}
