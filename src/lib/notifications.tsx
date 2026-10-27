import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Role } from './types';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string | null;
  title: string;
  message: string;
  read: boolean;
  action_link: string | null;
  action_label: string | null;
  data: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const PAGE = 50;

interface NotificationsValue {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  desktopAlerts: NotificationPermission | 'unsupported';
  enableDesktopAlerts: () => Promise<void>;
}

const Ctx = createContext<NotificationsValue | undefined>(undefined);

const desktopSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const userId = profile?.id;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [desktopAlerts, setDesktopAlerts] = useState<NotificationPermission | 'unsupported'>(
    desktopSupported() ? Notification.permission : 'unsupported'
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const countUnread = useCallback(async () => {
    if (!userId) return;
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);
    setUnread(count || 0);
  }, [userId]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(0, PAGE - 1);
    const rows = (data as AppNotification[]) || [];
    setItems(rows);
    setHasMore(rows.length === PAGE);
    setLoading(false);
    countUnread();
  }, [userId, countUnread]);

  const loadMore = useCallback(async () => {
    if (!userId) return;
    const from = itemsRef.current.length;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    const rows = (data as AppNotification[]) || [];
    setItems(prev => [...prev, ...rows.filter(r => !prev.some(p => p.id === r.id))]);
    setHasMore(rows.length === PAGE);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    const channel = supabase
      .channel(`web-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
        const n = payload.new as AppNotification;
        setItems(prev => (prev.some(p => p.id === n.id) ? prev : [n, ...prev]));
        if (!n.read) setUnread(c => c + 1);
        if (desktopSupported() && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
          try {
            new Notification(n.title, { body: n.message, icon: `${import.meta.env.BASE_URL}logo.png`, tag: n.id });
          } catch {
            // some browsers only allow notifications from a service worker
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
        const n = payload.new as AppNotification;
        setItems(prev => prev.map(p => (p.id === n.id ? n : p)));
        countUnread();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
        const id = (payload.old as { id: string }).id;
        setItems(prev => prev.filter(p => p.id !== id));
        countUnread();
      })
      .subscribe();
    // Catch up after the tab was in the background or offline.
    const onFocus = () => countUnread();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [userId, load, countUnread]);

  const markRead = async (id: string) => {
    const target = items.find(i => i.id === id);
    if (!target || target.read) return;
    setItems(prev => prev.map(p => (p.id === id ? { ...p, read: true } : p)));
    setUnread(c => Math.max(0, c - 1));
    await supabase.from('notifications').update({ read: true }).eq('id', id);
  };

  const markAllRead = async () => {
    if (!userId) return;
    setItems(prev => prev.map(p => ({ ...p, read: true })));
    setUnread(0);
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  };

  const remove = async (id: string) => {
    const target = items.find(i => i.id === id);
    setItems(prev => prev.filter(p => p.id !== id));
    if (target && !target.read) setUnread(c => Math.max(0, c - 1));
    await supabase.from('notifications').delete().eq('id', id);
  };

  const enableDesktopAlerts = async () => {
    if (!desktopSupported()) return;
    setDesktopAlerts(await Notification.requestPermission());
  };

  return (
    <Ctx.Provider value={{ items, unread, loading, hasMore, loadMore, markRead, markAllRead, remove, desktopAlerts, enableDesktopAlerts }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

const ADMIN_SECTIONS: Record<string, string> = {
  orders: '/admin/orders',
  vendors: '/admin/vendors',
  menu: '/admin/menu',
  products: '/admin/menu',
  promotions: '/admin/promotions',
  withdrawals: '/admin/withdrawals',
  complaints: '/admin/complaints',
  riders: '/admin/riders',
  users: '/admin/users',
  subscriptions: '/admin/subscriptions',
  reports: '/admin/reports',
};

// Turns a stored action_link (written for the mobile app) into a dashboard route.
export function notificationRoute(n: AppNotification, role: Role | undefined): string {
  const meta = { ...(n.metadata || {}), ...(n.data || {}) } as Record<string, unknown>;
  const complaintId = typeof meta.complaint_id === 'string' ? meta.complaint_id : null;
  const orderId = typeof meta.order_id === 'string' ? meta.order_id : null;
  const parts = (n.action_link || '').split('?')[0].split('/').filter(Boolean);

  if (role === 'admin') {
    if (complaintId) return `/admin/complaints?id=${encodeURIComponent(complaintId)}`;
    if (parts[0] === 'admin' && parts[1] && ADMIN_SECTIONS[parts[1]]) {
      const base = ADMIN_SECTIONS[parts[1]];
      if (base === '/admin/orders' && (parts[2] || orderId)) return `${base}?order=${encodeURIComponent(parts[2] || orderId!)}`;
      return base;
    }
    return orderId ? `/admin/orders?order=${encodeURIComponent(orderId)}` : '/admin/notifications';
  }

  if (complaintId || parts[0] === 'complaints') return `/vendor/support${complaintId ? `?id=${encodeURIComponent(complaintId)}` : ''}`;
  if (parts[0] === 'vendor' && parts[1] === 'orders') {
    const id = parts[2] || orderId;
    return id ? `/vendor/orders?order=${encodeURIComponent(id)}` : '/vendor/orders';
  }
  if (parts[0] === 'vendor' && ['menu', 'earnings', 'settings'].includes(parts[1])) return `/vendor/${parts[1]}`;
  if (orderId) return `/vendor/orders?order=${encodeURIComponent(orderId)}`;
  return '/vendor/notifications';
}
