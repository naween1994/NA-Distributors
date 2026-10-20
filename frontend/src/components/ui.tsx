import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useId, isValidElement, cloneElement, Children } from 'react';
import type { ReactNode, ReactElement, FormEvent } from 'react';
import {
  X,
  ArrowUpRight,
  Package,
  LoaderCircle,
  Search,
  ChevronDown,
  Download,
  Check,
  LockKeyhole,
} from 'lucide-react';
import { useApp } from '../context';
import { download } from '../api';
export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button className={'button ' + variant + ' ' + className} {...props}>
      {children}
    </button>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function Card({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={'card ' + className} {...props}>
      {children}
    </div>
  );
}
export function Empty({
  icon = <Package size={27} />,
  title = 'Nothing here yet',
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={'empty ' + (compact ? 'compact' : '')}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <strong>We couldn’t load this.</strong>
      <span>{message}</span>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Status({ value, overdue = false }: { value: string; overdue?: boolean }) {
  return (
    <span className={'badge ' + (overdue ? 'overdue' : value)}>
      <span className="badge-dot" />
      {overdue
        ? 'Overdue'
        : value === 'partial'
          ? 'Part paid'
          : value === 'unpaid'
            ? 'Unpaid'
            : value === 'paid'
              ? 'Paid'
              : value}
    </span>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-field">
      <Search size={17} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button aria-label="Clear search" onClick={() => onChange('')}>
          <X size={15} />
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  let assigned = false;
  function attach(node: ReactNode): ReactNode {
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<Record<string, unknown>>;
    if (
      !assigned &&
      (['input', 'textarea', 'select'].includes(String(element.type)) || element.type === Select)
    ) {
      assigned = true;
      return cloneElement(element, {
        id,
        'aria-label': element.props['aria-label'] || label,
        'aria-describedby': hint ? id + '-hint' : undefined,
      });
    }
    if (element.props.children)
      return cloneElement(element, {
        children: Children.map(element.props.children as ReactNode, attach),
      });
    return node;
  }
  return (
    <div className={'field ' + className}>
      <label htmlFor={id}>{label}</label>
      {Children.map(children, attach)}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </div>
  );
}
export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrap">
      <select {...props}>{children}</select>
      <ChevronDown size={15} />
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = document.getElementById('root');
    const wasInert = root?.inert || false;
    if (root) root.inert = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const element = ref.current;
    const focusable = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,a[href],[tabindex="0"]',
        ) || [],
      ).filter((e) => !e.hasAttribute('disabled') && e.offsetParent !== null);
    const items = focusable();
    (items[1] || items[0])?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const list = focusable();
        const first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      if (root) root.inert = wasInert;
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', listener);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
export function ConfirmDelete({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: (password: string) => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm(password);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="modal-body">
        <div className="warning-box">{description}</div>
        <Field label="Admin password" hint="An active administrator must confirm this action.">
          <input
            autoComplete="current-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy}>
            <LockKeyhole size={16} />
            {busy ? 'Confirming…' : 'Confirm deletion'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function ExportButton({
  path,
  name,
  label = 'Export CSV',
}: {
  path: string;
  name: string;
  label?: string;
}) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await download(path, name);
          toast('Export downloaded.');
        } catch (e) {
          toast((e as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download size={16} />
      {busy ? 'Exporting…' : label}
    </Button>
  );
}
export function StatCard({
  label,
  value,
  detail,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={'stat-card ' + (highlight ? 'highlight' : '')}>
      <div className="stat-top">
        <span>{label}</span>
        <div className="stat-icon">{icon}</div>
      </div>
      <strong className="stat-value">{value}</strong>
      <div className="stat-bottom">
        <span>{detail}</span>
        <ArrowUpRight size={14} />
      </div>
    </Card>
  );
}
export function SaveFooter({
  busy,
  onClose,
  label = 'Save changes',
}: {
  busy: boolean;
  onClose: () => void;
  label?: string;
}) {
  return (
    <div className="form-actions">
      <Button variant="secondary" type="button" onClick={onClose}>
        Cancel
      </Button>
      <Button disabled={busy}>
        <Check size={16} />
        {busy ? 'Saving…' : label}
      </Button>
    </div>
  );
}
