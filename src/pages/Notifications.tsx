import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Button, Card, EmptyState, PageHeader, Spinner, Tabs, cx } from '../components/ui';
import { notificationRoute, useNotifications } from '../lib/notifications';
import { dateTime, timeAgo } from '../lib/format';

type Filter = 'all' | 'unread';

export function NotificationsPage() {
  const { items, unread, loading, hasMore, loadMore, markRead, markAllRead, remove, desktopAlerts, enableDesktopAlerts } = useNotifications();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [loadingMore, setLoadingMore] = useState(false);

  const visible = useMemo(() => (filter === 'unread' ? items.filter(i => !i.read) : items), [items, filter]);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : 'You are all caught up'}
        actions={
          <>
            {desktopAlerts === 'default' && (
              <Button variant="secondary" icon={<BellRing className="size-4" />} onClick={enableDesktopAlerts}>
                Turn on desktop alerts
              </Button>
            )}
            {unread > 0 && (
              <Button variant="secondary" icon={<CheckCheck className="size-4" />} onClick={markAllRead}>
                Mark all read
              </Button>
            )}
          </>
        }
      />
      {desktopAlerts === 'denied' && (
        <p className="mb-4 text-xs text-ink-3">Desktop alerts are blocked for this site. Allow notifications in your browser's site settings to get them.</p>
      )}

      <div className="mb-4">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread', count: unread },
          ]}
        />
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading notifications…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Bell className="size-8" />} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map(n => (
              <li key={n.id} className="group flex items-start gap-3 px-5 py-4 hover:bg-surface-2">
                <span className={cx('mt-2 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand')} />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    markRead(n.id);
                    navigate(notificationRoute(n, profile?.role));
                  }}
                >
                  <div className={cx('text-sm', !n.read && 'font-semibold')}>{n.title}</div>
                  <div className="mt-0.5 text-sm text-ink-2">{n.message}</div>
                  <div className="mt-1 text-xs text-ink-3" title={dateTime(n.created_at)}>{timeAgo(n.created_at)}</div>
                </button>
                <button
                  onClick={() => remove(n.id)}
                  className="rounded-lg p-1.5 text-ink-3 opacity-0 hover:bg-surface-3 hover:text-bad group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete notification"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {hasMore && filter === 'all' && (
          <div className="border-t border-line px-4 py-3 text-center">
            <Button
              size="sm"
              variant="secondary"
              loading={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                await loadMore();
                setLoadingMore(false);
              }}
            >
              Load older
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
