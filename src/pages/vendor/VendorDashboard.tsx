import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, ShoppingBag, TrendingUp, Wallet, UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Card, EmptyState, OrderStatusBadge, PageHeader, StatCard } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { daysAgo, naira, startOfToday, timeAgo } from '../../lib/format';
import { ACTIVE_STATUSES, orderLabel } from '../../lib/orders';
import { useVendorOrders } from './VendorOrders';

export function VendorDashboard() {
  const { vendor } = useAuth();
  const { orders, loading } = useVendorOrders(vendor?.id);
  const [pendingDishes, setPendingDishes] = useState(0);

  useEffect(() => {
    if (!vendor) return;
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id)
      .eq('approval_status', 'pending')
      .then(({ count }) => setPendingDishes(count || 0));
  }, [vendor]);

  const stats = useMemo(() => {
    const today = startOfToday().getTime();
    const weekStart = daysAgo(6).getTime();
    const live = orders.filter(o => o.status !== 'cancelled');
    const todays = live.filter(o => new Date(o.created_at).getTime() >= today);
    const week = live.filter(o => new Date(o.created_at).getTime() >= weekStart);
    return {
      todayCount: todays.length,
      todaySales: todays.reduce((s, o) => s + (Number(o.vendor_payout) || 0), 0),
      waiting: orders.filter(o => o.status === 'pending' || o.status === 'scheduled').length,
      inProgress: orders.filter(o => ['confirmed', 'preparing', 'ready'].includes(o.status)).length,
      weekEarnings: week.reduce((s, o) => s + (Number(o.vendor_payout) || 0), 0),
    };
  }, [orders]);

  if (!vendor) return <EmptyState title="No store found" text="Finish setting up your store in the Vesphe app." />;

  const active = orders.filter(o => ACTIVE_STATUSES.includes(o.status)).slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back, ${vendor.name}`} subtitle={vendor.is_open ? 'Your store is open' : 'Your store is closed to new orders'} />

      {(!vendor.is_approved || vendor.is_suspended) && (
        <Banner tone="warn" title={vendor.is_suspended ? 'Store suspended' : 'Awaiting approval'}>
          {vendor.is_suspended
            ? 'Your store is hidden from customers. Contact Vesphe support to resolve this.'
            : 'Customers will see your store once an admin approves it. You can set up your menu in the meantime.'}
        </Banner>
      )}
      {!vendor.paystack_subaccount_code && (
        <Banner tone="warn" title="Add your bank account">
          Card payments go straight to your bank, but only after you verify your account.{' '}
          <Link to="/vendor/settings" className="font-medium text-brand hover:underline">Set it up in Settings →</Link>
        </Banner>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting for you" value={stats.waiting} tone={stats.waiting ? 'warn' : 'default'} icon={<Clock className="size-4" />} hint="New orders to accept" />
        <StatCard label="In progress" value={stats.inProgress} icon={<ShoppingBag className="size-4" />} hint="Accepted, preparing or ready" />
        <StatCard label="Today" value={naira(stats.todaySales)} tone="brand" icon={<TrendingUp className="size-4" />} hint={`${stats.todayCount} orders`} />
        <StatCard label="Last 7 days" value={naira(stats.weekEarnings)} icon={<Wallet className="size-4" />} hint="Your share" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">Active orders</h2>
            <Link to="/vendor/orders" className="text-sm text-brand hover:underline">View all</Link>
          </div>
          {loading ? (
            <div className="p-5 text-sm text-ink-2">Loading…</div>
          ) : active.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="size-8" />} title="No active orders" text="New orders will show up here." />
          ) : (
            <ul className="divide-y divide-line">
              {active.map(o => (
                <li key={o.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{orderLabel(o)} · {o.customer?.name || o.customer_name || 'Customer'}</div>
                    <div className="truncate text-xs text-ink-3">
                      {timeAgo(o.created_at)} · {(o.items || []).map(i => `${i.quantity}× ${i.name}`).join(', ')}
                    </div>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Menu</h2>
          <div className="flex items-center gap-3 text-sm">
            <UtensilsCrossed className="size-5 text-ink-3" />
            {pendingDishes > 0 ? (
              <span><span className="font-semibold text-warn">{pendingDishes}</span> dish{pendingDishes === 1 ? '' : 'es'} awaiting admin approval</span>
            ) : (
              <span className="text-ink-2">No dishes waiting for approval</span>
            )}
          </div>
          <Link to="/vendor/menu" className="mt-4 inline-block text-sm text-brand hover:underline">Manage menu →</Link>
        </Card>
      </div>
    </div>
  );
}

function Banner({ tone, title, children }: { tone: 'warn'; title: string; children: ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${tone === 'warn' ? 'border-warn/30 bg-warn/10' : ''}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div>
        <div className="font-medium text-warn">{title}</div>
        <div className="mt-0.5 text-ink-2">{children}</div>
      </div>
    </div>
  );
}
