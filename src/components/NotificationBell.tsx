import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { notificationRoute, useNotifications, type AppNotification } from '../lib/notifications';
import { timeAgo } from '../lib/format';
import { cx } from './ui';

export function NotificationBell({ align = 'left' }: { align?: 'left' | 'right' }) {
  const { unread, items, markRead, markAllRead } = useNotifications();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const openItem = (n: AppNotification) => {
    markRead(n.id);
    setOpen(false);
    navigate(notificationRoute(n, profile?.role));
  };

  const base = profile?.role === 'admin' ? '/admin' : '/vendor';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative rounded-lg p-2 text-ink-2 hover:bg-surface-2 hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cx(
            'absolute z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-brand hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">No notifications yet</li>}
            {items.slice(0, 15).map(n => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')} />
                  <span className="min-w-0">
                    <span className={cx('block truncate text-sm', !n.read && 'font-semibold')}>{n.title}</span>
                    <span className="line-clamp-2 block text-xs text-ink-2">{n.message}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-3">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link to={`${base}/notifications`} onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-sm text-brand hover:bg-surface-2">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
