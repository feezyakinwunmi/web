import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Bike, ClipboardCheck, Megaphone, MessageSquareWarning, ShoppingBag, Store, TrendingUp } from 'lucide-react';
import { Card, EmptyState, OrderStatusBadge, PageHeader, Spinner, StatCard } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { naira, timeAgo } from '../../lib/format';
import { periodBounds } from '../../lib/period';
import { ORDER_SELECT, orderLabel } from '../../lib/orders';
import type { Order } from '../../lib/types';

interface Totals {
  orders: number;
  gmv: number;
  revenue: number;
}

interface Overview {
  today: Totals;
  month: Totals;
  allTime: Totals & { customers: number; vendors: number; pro: number };
  pendingVendors: number;
  openComplaints: number;
  riderApplications: number;
  pendingDishes: number;
  pendingPromotions: number;
  pendingWithdrawals: number;
  recent: Order[];
}

const count = async (table: string, apply: (q: any) => any) => {
  const { count: c } = await apply(supabase.from(table).select('id', { count: 'exact', head: true }));
  return c || 0;
};

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    (async () => {
      const report = (preset: 'today' | 'month' | 'all') => {
        const { from, to } = periodBounds({ preset });
        return supabase.rpc('admin_report', { p_from: from, p_to: to });
      };
      const [today, month, all, { data: recent }, pendingVendors, pendingDishes, pendingPromotions, pendingWithdrawals, openComplaints, riderApplications] =
        await Promise.all([
          report('today'),
          report('month'),
          report('all'),
          supabase.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(8),
          count('vendors', q => q.eq('is_approved', false).eq('is_suspended', false)),
          count('products', q => q.eq('approval_status', 'pending')),
          count('promotions', q => q.eq('status', 'pending_approval')),
          count('withdrawals', q => q.in('status', ['pending', 'processing'])),
          count('complaints', q => q.eq('status', 'pending')),
          count('rider_applications', q => q.eq('status', 'pending')),
        ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totals = (r: any): Totals => ({
        orders: Number(r?.orders?.placed) || 0,
        gmv: Number(r?.sales?.gmv) || 0,
        revenue: Number(r?.platform?.total) || 0,
      });
      const a = all.data;
      setData({
        today: totals(today.data),
        month: totals(month.data),
        allTime: {
          ...totals(a),
          customers: Number(a?.totals_all_time?.customers) || 0,
          vendors: Number(a?.totals_all_time?.vendors_approved) || 0,
          pro: Number(a?.pro?.active_now) || 0,
        },
        pendingVendors,
        openComplaints,
        riderApplications,
        pendingDishes,
        pendingPromotions,
        pendingWithdrawals,
        recent: (recent as Order[]) || [],
      });
    })();
  }, []);

  if (!data) return <Spinner label="Loading overview…" />;

  const queues = [
    { to: '/admin/vendors', label: 'Vendors to approve', value: data.pendingVendors, icon: <Store className="size-4" /> },
    { to: '/admin/menu', label: 'Dishes to review', value: data.pendingDishes, icon: <ClipboardCheck className="size-4" /> },
    { to: '/admin/promotions', label: 'Promotions to approve', value: data.pendingPromotions, icon: <Megaphone className="size-4" /> },
    { to: '/admin/withdrawals', label: 'Withdrawals to pay', value: data.pendingWithdrawals, icon: <Banknote className="size-4" /> },
    { to: '/admin/complaints', label: 'Open complaints', value: data.openComplaints, icon: <MessageSquareWarning className="size-4" /> },
    { to: '/admin/riders', label: 'Rider applications', value: data.riderApplications, icon: <Bike className="size-4" /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle="What's happening across Vesphe" actions={<Link to="/admin/reports" className="text-sm text-brand hover:underline">Full reports →</Link>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sales today" value={naira(data.today.gmv)} icon={<ShoppingBag className="size-4" />} hint={`${data.today.orders} orders · ${naira(data.today.revenue)} Vesphe revenue`} />
        <StatCard label="Sales this month" value={naira(data.month.gmv)} tone="brand" icon={<TrendingUp className="size-4" />} hint={`${data.month.orders} orders · ${naira(data.month.revenue)} Vesphe revenue`} />
        <StatCard label="Sales, all time" value={naira(data.allTime.gmv)} hint={`${data.allTime.orders.toLocaleString()} orders · ${naira(data.allTime.revenue)} Vesphe revenue`} />
        <StatCard label="Customers" value={data.allTime.customers.toLocaleString()} hint={`${data.allTime.vendors} live vendors · ${data.allTime.pro} on Pro`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {queues.map(q => (
          <Link key={q.to} to={q.to}>
            <Card className="flex items-center justify-between p-5 transition-colors hover:border-brand/40">
              <div className="flex items-center gap-3 text-sm text-ink-2">{q.icon}{q.label}</div>
              <span className={`text-xl font-semibold ${q.value ? 'text-warn' : 'text-ink-3'}`}>{q.value}</span>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold">Latest orders</h2>
          <Link to="/admin/orders" className="text-sm text-brand hover:underline">All orders</Link>
        </div>
        {data.recent.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <ul className="divide-y divide-line">
            {data.recent.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{orderLabel(o)} · {o.vendor?.name || 'Vendor'}</div>
                  <div className="text-xs text-ink-3">{timeAgo(o.created_at)} · {o.customer?.name || o.customer_name || 'Customer'} · {naira(o.total)}</div>
                </div>
                <OrderStatusBadge status={o.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
