import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Search, ShoppingBag, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { OrderDrawer } from '../../components/OrderDrawer';
import { PeriodPicker } from '../../components/PeriodPicker';
import { Badge, Button, Card, EmptyState, Input, LoadMore, OrderStatusBadge, PageHeader, Select, Spinner, Table, Tabs, Td, Th } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { dateTime, naira } from '../../lib/format';
import { ALL_TIME, applyPeriod, periodBounds, periodLabel, type Period } from '../../lib/period';
import { downloadCsv } from '../../lib/csv';
import { ACTIVE_STATUSES, COMPLETED_STATUSES, ORDER_SELECT, canCancel, cancelOrder, isPaidCard, orderLabel } from '../../lib/orders';
import type { Order } from '../../lib/types';

type Filter = 'active' | 'completed' | 'cancelled' | 'all';
type Payment = 'any' | 'card' | 'cash' | 'refunded' | 'refund_owed';
const PAGE = 100;

export function AdminOrders() {
  const { toast, confirm } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [payment, setPayment] = useState<Payment>('any');
  const [vendorId, setVendorId] = useState('');
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ gmv: number; commission: number; placed: number } | null>(null);

  useEffect(() => {
    supabase.from('vendors').select('id, name').order('name').then(({ data }) => setVendors(data || []));
  }, []);

  const buildQuery = useCallback(() => {
    let q = supabase.from('orders').select(ORDER_SELECT, { count: 'exact' }).order('created_at', { ascending: false });
    q = applyPeriod(q, period);
    if (filter === 'active') q = q.in('status', ACTIVE_STATUSES);
    if (filter === 'completed') q = q.in('status', COMPLETED_STATUSES);
    if (filter === 'cancelled') q = q.eq('status', 'cancelled');
    if (payment === 'card' || payment === 'cash') q = q.eq('payment_method', payment);
    if (payment === 'refunded') q = q.eq('payment_status', 'refunded');
    if (payment === 'refund_owed') q = q.eq('status', 'cancelled').eq('payment_method', 'card').eq('payment_status', 'paid');
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const term = query.trim().replace(/^#/, '').replace(/[,()%*\\]/g, ' ');
    if (term) q = q.or(`order_number.ilike.%${term}%,id.ilike.%${term}%,customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
    return q;
  }, [period, filter, payment, vendorId, query]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error, count } = await buildQuery().range(0, PAGE - 1);
    if (error) toast(error.message, 'error');
    setOrders((data as Order[]) || []);
    setTotal(count ?? null);
    setLoading(false);
  }, [buildQuery, toast]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // Period totals (all orders in the period, not just the loaded page).
  useEffect(() => {
    const { from, to } = periodBounds(period);
    supabase.rpc('admin_report', { p_from: from, p_to: to }).then(({ data, error }) => {
      if (error || !data) return setSummary(null);
      setSummary({ gmv: Number(data.sales.gmv), commission: Number(data.platform.commission), placed: Number(data.orders.placed) });
    });
  }, [period]);

  // Opened from a notification or complaint: /admin/orders?order=<id or number>
  useEffect(() => {
    const ref = params.get('order');
    if (!ref) return;
    setParams({}, { replace: true });
    supabase
      .from('orders')
      .select(ORDER_SELECT)
      .or(`id.eq.${ref.replace(/[,()]/g, '')},order_number.eq.${ref.replace(/[,()]/g, '')}`)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => (data ? setSelected(data as Order) : toast('Order not found', 'error')));
  }, [params, setParams, toast]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await buildQuery().range(orders.length, orders.length + PAGE - 1);
    setOrders(prev => [...prev, ...((data as Order[]) || [])]);
    setLoadingMore(false);
  };

  const exportCsv = async () => {
    const { data, error } = await buildQuery().range(0, 9999);
    if (error) return toast(error.message, 'error');
    downloadCsv(`vesphe-orders-${period.preset}.csv`, ((data as Order[]) || []).map(o => ({
      order: orderLabel(o),
      date: o.created_at,
      status: o.status,
      vendor: o.vendor?.name,
      customer: o.customer?.name || o.customer_name,
      customer_phone: o.customer?.phone || o.customer_phone,
      subtotal: o.subtotal,
      delivery_fee: o.delivery_fee,
      service_fee: o.service_fee,
      discount: o.discount,
      total: o.total,
      commission: o.platform_commission,
      vendor_payout: o.vendor_payout,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      payment_reference: o.payment_reference,
    })));
  };

  const cancel = async (order: Order) => {
    const ok = await confirm({
      title: order.status === 'cancelled' ? `Refund ${orderLabel(order)}?` : `Cancel ${orderLabel(order)}?`,
      message: isPaidCard(order) ? 'The customer paid by card and will be refunded in full.' : 'The order will be cancelled.',
      confirmLabel: 'Cancel order',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await cancelOrder(order, 'Cancelled by Vesphe support', 'admin');
      toast(result === 'refunded' ? 'Order cancelled and refund started' : 'Order cancelled');
      setSelected(null);
      load();
    } catch (e) {
      toast((e as Error).message || 'Could not cancel order', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={
          summary
            ? `${periodLabel(period)} · ${summary.placed.toLocaleString()} orders · ${naira(summary.gmv)} sales · ${naira(summary.commission)} commission`
            : periodLabel(period)
        }
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Export CSV</Button>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>
          </>
        }
      />

      <div className="mb-4 space-y-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input placeholder="Order #, customer name or phone" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={vendorId} onChange={e => setVendorId(e.target.value)} className="w-48" aria-label="Vendor">
            <option value="">All vendors</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <Select value={payment} onChange={e => setPayment(e.target.value as Payment)} className="w-44" aria-label="Payment">
            <option value="any">Any payment</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="refunded">Refunded</option>
            <option value="refund_owed">Refund owed</option>
          </Select>
        </div>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading orders…" />
        ) : orders.length === 0 ? (
          <EmptyState icon={<ShoppingBag className="size-8" />} title="No orders match" />
        ) : (
          <>
            <Table
              head={
                <tr>
                  <Th>Order</Th>
                  <Th>Vendor</Th>
                  <Th>Customer</Th>
                  <Th>Total</Th>
                  <Th>Commission</Th>
                  <Th>Payment</Th>
                  <Th>Status</Th>
                </tr>
              }
            >
              {orders.map(o => (
                <tr key={o.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(o)}>
                  <Td>
                    <div className="font-medium">{orderLabel(o)}</div>
                    <div className="text-xs text-ink-3">{dateTime(o.created_at)}</div>
                  </Td>
                  <Td>{o.vendor?.name || '—'}</Td>
                  <Td>{o.customer?.name || o.customer_name || 'Customer'}</Td>
                  <Td className="font-medium">{naira(o.total)}</Td>
                  <Td className="text-ok">{naira(o.platform_commission)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={o.payment_method === 'card' ? 'info' : 'neutral'}>{o.payment_method}</Badge>
                      {o.payment_method === 'card' && (
                        <Badge tone={o.payment_status === 'paid' ? (o.status === 'cancelled' ? 'warn' : 'ok') : o.payment_status === 'refunded' ? 'info' : 'warn'}>
                          {o.payment_status === 'paid' && o.status === 'cancelled' ? 'refund owed' : o.payment_status || 'unpaid'}
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td><OrderStatusBadge status={o.status} /></Td>
                </tr>
              ))}
            </Table>
            <LoadMore shown={orders.length} total={total} loading={loadingMore} onClick={loadMore} />
          </>
        )}
      </Card>

      <OrderDrawer
        order={selected}
        onClose={() => setSelected(null)}
        showVendor
        showPlatform
        actions={
          selected && (canCancel(selected) || (selected.status === 'cancelled' && isPaidCard(selected))) && (
            <Button variant="danger" loading={busy} onClick={() => cancel(selected)}>
              {selected.status === 'cancelled' ? 'Refund customer' : isPaidCard(selected) ? 'Cancel & refund' : 'Cancel order'}
            </Button>
          )
        }
      />
    </div>
  );
}
