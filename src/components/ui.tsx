import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

/* ---------- Buttons ---------- */
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-orange-500 disabled:bg-brand/50',
  secondary: 'bg-surface-2 text-ink border border-line hover:bg-surface-3',
  danger: 'bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25',
  success: 'bg-ok/15 text-ok border border-ok/30 hover:bg-ok/25',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        variants[variant],
        className
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ---------- Layout bits ---------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-line bg-surface', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'default', icon }: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'brand' | 'ok' | 'warn' | 'bad';
  icon?: ReactNode;
}) {
  const toneClass = { default: 'text-ink', brand: 'text-brand', ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-sm text-ink-2">
        <span>{label}</span>
        {icon && <span className="text-ink-3">{icon}</span>}
      </div>
      <div className={cx('mt-2 text-2xl font-semibold', toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </Card>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-2">
      <Loader2 className="size-5 animate-spin text-brand" />
      {label}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {icon && <div className="mb-2 text-ink-3">{icon}</div>}
      <div className="font-medium">{title}</div>
      {text && <div className="max-w-sm text-sm text-ink-2">{text}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ---------- Badges ---------- */
type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-ink-2',
  brand: 'bg-brand/15 text-brand',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  info: 'bg-info/15 text-info',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}

const ORDER_TONES: Record<string, Tone> = {
  pending: 'warn',
  scheduled: 'info',
  confirmed: 'info',
  preparing: 'brand',
  ready: 'ok',
  picked_up: 'ok',
  in_transit: 'ok',
  delivered: 'ok',
  cancelled: 'bad',
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={ORDER_TONES[status] || 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

/* ---------- Form controls ---------- */
const fieldBase =
  'w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none';

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-bad">{error}</span> : hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldBase, 'h-10', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldBase, 'min-h-24 py-2', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldBase, 'h-10', props.className)} />;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm disabled:opacity-50"
    >
      <span className={cx('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-ok' : 'bg-surface-3')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white transition-all', checked ? 'left-4.5' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-brand bg-brand/15 text-brand' : 'border-line bg-surface-2 text-ink-2 hover:text-ink'
      )}
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:text-ink'
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 text-xs text-ink-3">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Overlays ---------- */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, children, footer, width = 'max-w-xl' }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className={cx('relative flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl', width)}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</footer>}
      </aside>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-line bg-surface shadow-2xl">
        <div className="border-b border-line px-5 py-4 text-lg font-semibold">{title}</div>
        <div className="px-5 py-4 text-sm text-ink-2">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Table ---------- */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-3">{head}</thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cx('px-4 py-3 font-medium', className)}>{children}</th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx('px-4 py-3 align-middle', className)}>{children}</td>
);

export { cx };

/* ---------- Password with show/hide ---------- */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={cx(fieldBase, 'h-10 pr-10', props.className)} />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-3 hover:text-ink"
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/* ---------- Load more ---------- */
export function LoadMore({ shown, total, loading, onClick }: { shown: number; total: number | null; loading?: boolean; onClick: () => void }) {
  if (total === null || shown >= total) {
    return shown > 0 ? <div className="px-4 py-3 text-center text-xs text-ink-3">Showing all {shown}</div> : null;
  }
  return (
    <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-3 text-xs text-ink-3">
      Showing {shown.toLocaleString()} of {total.toLocaleString()}
      <Button size="sm" variant="secondary" loading={loading} onClick={onClick}>Load more</Button>
    </div>
  );
}
