import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ShoppingBag, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../components/Toast';
import { OrderDrawer } from '../../components/OrderDrawer';
import { Badge, Button, Card, EmptyState, Input, OrderStatusBadge, PageHeader, Spinner, Table, Tabs, Td, Th } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { naira, timeAgo } from '../../lib/format';
import { ACTIVE_STATUSES, COMPLETED_STATUSES, ORDER_SELECT, VENDOR_NEXT, canCancel, cancelOrder, isPaidCard, orderLabel, setOrderStatus } from '../../lib/orders';
import type { Order } from '../../lib/types';

type Filter = 'active' | 'completed' | 'cancelled' | 'all';

// Short two-tone alert for new orders (no audio file needed).
function playNewOrderSound() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
  } catch {
    // browser blocked audio until the page is clicked
  }
}

export function useVendorOrders(vendorId: string | undefined, onNewOrder?: (order: Order) => void) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const knownIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!vendorId) return;
    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('vendor_id', vendorId)
      // Card orders appear only after Paystack payment is confirmed.
      .or('payment_method.neq.card,payment_status.neq.pending')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error && data) {
      const list = data as Order[];
      if (knownIds.current.size > 0) {
        list.filter(o => !knownIds.current.has(o.id) && o.status === 'pending').forEach(o => onNewOrder?.(o));
      }
      knownIds.current = new Set(list.map(o => o.id));
      setOrders(list);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    load();
    if (!vendorId) return;
    const channel = supabase
      .channel(`web-vendor-orders-${vendorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `vendor_id=eq.${vendorId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [vendorId, load]);

  return { orders, loading, reload: load };
}

export function VendorOrders() {
  const { vendor } = useAuth();
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const { orders, loading, reload } = useVendorOrders(vendor?.id, order => {
    playNewOrderSound();
    toast(`New order ${orderLabel(order)} · ${naira(order.total)}`, 'info');
  });

  // Opened from a notification: /vendor/orders?order=<id>
  const [params, setParams] = useSearchParams();
  const linkedOrder = params.get('order');
  useEffect(() => {
    if (!linkedOrder || loading) return;
    const match = orders.find(o => o.id === linkedOrder || o.order_number === linkedOrder);
    if (match) {
      setSelected(match);
      setFilter('all');
    }
    setParams({}, { replace: true });
  }, [linkedOrder, loading, orders, setParams]);

  // Keep the open drawer in sync with live updates.
  useEffect(() => {
    if (selected) setSelected(orders.find(o => o.id === selected.id) || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const counts = useMemo(() => ({
    active: orders.filter(o => ACTIVE_STATUSES.includes(o.status)).length,
    completed: orders.filter(o => COMPLETED_STATUSES.includes(o.status)).length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
    all: orders.length,
  }), [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter(o =>
        filter === 'all' ? true
          : filter === 'active' ? ACTIVE_STATUSES.includes(o.status)
          : filter === 'completed' ? COMPLETED_STATUSES.includes(o.status)
          : o.status === 'cancelled'
      )
      .filter(o => !q || orderLabel(o).toLowerCase().includes(q) || (o.customer?.name || o.customer_name || '').toLowerCase().includes(q));
  }, [orders, filter, query]);

  const advance = async (order: Order) => {
    const next = VENDOR_NEXT[order.status];
    if (!next) return;
    setBusy(true);
    try {
      await setOrderStatus(order.id, next.status);
      toast(`${orderLabel(order)}: ${next.label.toLowerCase()}`);
      await reload();
    } catch (e) {
      toast((e as Error).message || 'Could not update order', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reject = async (order: Order) => {
    const ok = await confirm({
      title: `Reject ${orderLabel(order)}?`,
      message: isPaidCard(order)
        ? 'The customer paid by card. Rejecting cancels the order and refunds them in full.'
        : 'The order will be cancelled and the customer notified.',
      confirmLabel: 'Reject order',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await cancelOrder(order, 'Order rejected by vendor', 'vendor');
      toast(result === 'refunded' ? 'Order rejected and refund started' : 'Order rejected');
      await reload();
    } catch (e) {
      toast((e as Error).message || 'Could not reject order', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!vendor) return <EmptyState title="No store found" text="Finish setting up your store in the Vesphe app." />;

  const nextFor = selected ? VENDOR_NEXT[selected.status] : undefined;

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Updates live. New orders play a sound — keep this tab open during service."
        actions={<Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={reload}>Refresh</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'completed', label: 'Completed', count: counts.completed },
            { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Search order # or customer" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading orders…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="size-8" />} title="No orders here" text="Orders will appear here as customers place them." />
        ) : (
          <Table
            head={
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th>Your share</Th>
                <Th>Payment</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            }
          >
            {visible.map(order => {
              const next = VENDOR_NEXT[order.status];
              return (
                <tr key={order.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(order)}>
                  <Td>
                    <div className="font-medium">{orderLabel(order)}</div>
                    <div className="text-xs text-ink-3">{timeAgo(order.created_at)}</div>
                  </Td>
                  <Td>{order.customer?.name || order.customer_name || 'Customer'}</Td>
                  <Td className="max-w-56">
                    <span className="line-clamp-2 text-ink-2">
                      {(order.items || []).map(i => `${i.quantity}× ${i.name}`).join(', ')}
                    </span>
                  </Td>
                  <Td className="font-medium">{naira(order.vendor_payout)}</Td>
                  <Td>
                    <Badge tone={order.payment_method === 'card' ? 'info' : 'neutral'}>{order.payment_method}</Badge>
                  </Td>
                  <Td><OrderStatusBadge status={order.status} /></Td>
                  <Td className="text-right">
                    {next && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={e => {
                          e.stopPropagation();
                          advance(order);
                        }}
                      >
                        {next.label}
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <OrderDrawer
        order={selected}
        onClose={() => setSelected(null)}
        actions={
          selected && (
            <>
              {canCancel(selected) && (
                <Button variant="danger" disabled={busy} onClick={() => reject(selected)}>
                  Reject
                </Button>
              )}
              {nextFor && (
                <Button disabled={busy} onClick={() => advance(selected)}>
                  {nextFor.label}
                </Button>
              )}
            </>
          )
        }
      />
    </div>
  );
}
