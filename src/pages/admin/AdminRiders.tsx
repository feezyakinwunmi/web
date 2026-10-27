import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike, Download, FileText, MapPin, Phone, Mail, Search, Star } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Input, LoadMore, PageHeader, Spinner, Table, Tabs, Td, Th } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { dateOnly, dateTime, naira, timeAgo, titleCase } from '../../lib/format';
import { downloadCsv } from '../../lib/csv';

interface RiderUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  is_online: boolean | null;
  is_available: boolean | null;
  is_approved: boolean | null;
  is_suspended: boolean | null;
  rider_rating: number | null;
  rider_review_count: number | null;
  total_deliveries: number | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  license_number: string | null;
  vehicle_ownership: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  last_location_update: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
}

interface Application {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  vehicle_type: string | null;
  vehicle_number: string | null;
  vehicle_ownership: string | null;
  license_number: string | null;
  license_photo_url: string | null;
  id_card_url: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  status: string;
  created_at: string;
}

interface Stats {
  rider_id: string;
  deliveries: number;
  active_orders: number;
  order_earnings: number;
  logistics_deliveries: number;
  logistics_earnings: number;
  paid_out: number;
  pending_withdrawals: number;
  last_delivery_at: string | null;
}

interface Rider {
  user: RiderUser | null;
  application: Application | null;
  stats: Stats | null;
  id: string;
  name: string;
  status: 'active' | 'pending' | 'suspended' | 'rejected';
}

type Filter = Rider['status'] | 'online' | 'all';

const riderStatus = (u: RiderUser | null, a: Application | null): Rider['status'] => {
  if (u?.is_suspended) return 'suspended';
  if (a?.status === 'rejected') return 'rejected';
  if (a?.status === 'pending' || (u && u.role !== 'rider')) return 'pending';
  return 'active';
};

const STATUS_TONE = { active: 'ok', pending: 'warn', suspended: 'bad', rejected: 'neutral' } as const;

export function AdminRiders() {
  const { toast } = useFeedback();
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: apps, error: appsError }, statsRes] = await Promise.all([
      supabase.from('rider_applications').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_rider_stats'),
    ]);
    if (appsError) toast(appsError.message, 'error');
    if (statsRes.error) toast(statsRes.error.message, 'error');
    const applications = (apps as Application[]) || [];
    const ids = new Set<string>(applications.map(a => a.user_id));
    const { data: riderRows } = await supabase.from('users').select('*').eq('role', 'rider');
    (riderRows || []).forEach(r => ids.add(r.id));
    const missing = [...ids].filter(id => !(riderRows || []).some(r => r.id === id));
    const { data: applicantRows } = missing.length
      ? await supabase.from('users').select('*').in('id', missing)
      : { data: [] as RiderUser[] };
    const users = [...((riderRows as RiderUser[]) || []), ...((applicantRows as RiderUser[]) || [])];
    const stats = (statsRes.data as Stats[]) || [];

    const list: Rider[] = [...ids].map(id => {
      const user = users.find(u => u.id === id) || null;
      const application = applications.find(a => a.user_id === id) || null;
      return {
        id,
        user,
        application,
        stats: stats.find(s => s.rider_id === id) || null,
        name: user?.name || application?.full_name || 'Rider',
        status: riderStatus(user, application),
      };
    });
    list.sort((a, b) => (b.user?.created_at || b.application?.created_at || '').localeCompare(a.user?.created_at || a.application?.created_at || ''));
    setRiders(list);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const count = (f: Filter) =>
    f === 'all' ? riders.length : f === 'online' ? riders.filter(r => r.user?.is_online).length : riders.filter(r => r.status === f).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return riders
      .filter(r => filter === 'all' || (filter === 'online' ? r.user?.is_online : r.status === filter))
      .filter(r =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.user?.phone || r.application?.phone || '').includes(q) ||
        (r.user?.email || r.application?.email || '').toLowerCase().includes(q) ||
        (r.user?.vehicle_number || r.application?.vehicle_number || '').toLowerCase().includes(q)
      );
  }, [riders, filter, query]);

  const totals = useMemo(() => ({
    deliveries: riders.reduce((s, r) => s + Number(r.stats?.deliveries || 0) + Number(r.stats?.logistics_deliveries || 0), 0),
    earnings: riders.reduce((s, r) => s + Number(r.stats?.order_earnings || 0) + Number(r.stats?.logistics_earnings || 0), 0),
    paid: riders.reduce((s, r) => s + Number(r.stats?.paid_out || 0), 0),
  }), [riders]);

  const exportCsv = () =>
    downloadCsv('vesphe-riders.csv', visible.map(r => ({
      name: r.name,
      phone: r.user?.phone || r.application?.phone,
      email: r.user?.email || r.application?.email,
      status: r.status,
      vehicle: r.user?.vehicle_type || r.application?.vehicle_type,
      plate: r.user?.vehicle_number || r.application?.vehicle_number,
      ownership: r.user?.vehicle_ownership || r.application?.vehicle_ownership,
      food_deliveries: r.stats?.deliveries || 0,
      business_deliveries: r.stats?.logistics_deliveries || 0,
      earnings: Number(r.stats?.order_earnings || 0) + Number(r.stats?.logistics_earnings || 0),
      paid_out: r.stats?.paid_out || 0,
      rating: r.user?.rider_rating,
      joined: r.user?.created_at || r.application?.created_at,
    })));

  const selected = riders.find(r => r.id === selectedId) || null;

  return (
    <div>
      <PageHeader
        title="Riders"
        subtitle={`${riders.length} riders · ${totals.deliveries.toLocaleString()} deliveries · ${naira(totals.earnings)} earned · ${naira(totals.paid)} paid out (all time)`}
        actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!visible.length}>Export CSV</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'pending', label: 'Applications', count: count('pending') },
            { value: 'active', label: 'Active', count: count('active') },
            { value: 'online', label: 'Online now', count: count('online') },
            { value: 'suspended', label: 'Suspended', count: count('suspended') },
            { value: 'rejected', label: 'Rejected', count: count('rejected') },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Name, phone, email or plate" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading riders…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Bike className="size-8" />} title="No riders here" />
        ) : (
          <Table
            head={
              <tr>
                <Th>Rider</Th>
                <Th>Vehicle</Th>
                <Th>Deliveries</Th>
                <Th>Earned</Th>
                <Th>Paid out</Th>
                <Th>Rating</Th>
                <Th>Status</Th>
              </tr>
            }
          >
            {visible.map(r => {
              const u = r.user;
              const a = r.application;
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelectedId(r.id)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {u?.avatar_url ? <img src={u.avatar_url} alt="" className="size-9 rounded-full object-cover" /> : <div className="flex size-9 items-center justify-center rounded-full bg-surface-3"><Bike className="size-4 text-ink-3" /></div>}
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-ink-3">{u?.phone || a?.phone}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-ink-2">
                    <div className="capitalize">{u?.vehicle_type || a?.vehicle_type || '—'}</div>
                    <div className="text-xs text-ink-3">{u?.vehicle_number || a?.vehicle_number}{(u?.vehicle_ownership || a?.vehicle_ownership) ? ` · ${titleCase(u?.vehicle_ownership || a?.vehicle_ownership)}` : ''}</div>
                  </Td>
                  <Td>{(Number(r.stats?.deliveries || 0) + Number(r.stats?.logistics_deliveries || 0)).toLocaleString()}</Td>
                  <Td className="font-medium">{naira(Number(r.stats?.order_earnings || 0) + Number(r.stats?.logistics_earnings || 0))}</Td>
                  <Td className="text-ink-2">{naira(r.stats?.paid_out)}</Td>
                  <Td>{u?.rider_rating ? <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-warn text-warn" />{Number(u.rider_rating).toFixed(1)}</span> : <span className="text-ink-3">—</span>}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status === 'pending' ? 'application' : r.status}</Badge>
                      {u?.is_online && <Badge tone="ok">online</Badge>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {selected && <RiderDrawer key={selected.id} rider={selected} onClose={() => setSelectedId(null)} onChanged={load} />}
    </div>
  );
}

interface RiderOrder {
  id: string;
  order_number: string | null;
  status: string;
  rider_earnings: number | null;
  delivery_fee: number | null;
  distance_km: number | null;
  created_at: string;
  delivered_at: string | null;
  vendor: { name: string } | null;
}

interface Payout {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  processed_at: string | null;
  reference: string | null;
}

const PAGE = 50;

function RiderDrawer({ rider, onClose, onChanged }: { rider: Rider; onClose: () => void; onChanged: () => void }) {
  const { toast, confirm } = useFeedback();
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const u = rider.user;
  const a = rider.application;
  const s = rider.stats;

  const fetchOrders = useCallback(
    (from: number) =>
      supabase
        .from('orders')
        .select('id, order_number, status, rider_earnings, delivery_fee, distance_km, created_at, delivered_at, vendor:vendor_id(name)', { count: 'exact' })
        .eq('rider_id', rider.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1),
    [rider.id]
  );

  useEffect(() => {
    fetchOrders(0).then(({ data, count }) => {
      setOrders((data as unknown as RiderOrder[]) || []);
      setOrderTotal(count ?? null);
    });
    Promise.all([
      supabase.from('rider_withdrawals').select('id, amount, status, created_at, processed_at, reference').eq('rider_id', rider.id),
      supabase.from('withdrawals').select('id, amount, status, created_at, processed_at, reference').eq('user_id', rider.id),
    ]).then(([rw, w]) => {
      const all = [...((rw.data as Payout[]) || []), ...((w.data as Payout[]) || [])];
      all.sort((x, y) => y.created_at.localeCompare(x.created_at));
      setPayouts(all);
    });
  }, [fetchOrders, rider.id]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await fetchOrders(orders.length);
    setOrders(prev => [...prev, ...((data as unknown as RiderOrder[]) || [])]);
    setLoadingMore(false);
  };

  const review = async (approve: boolean) => {
    if (!a) return;
    const ok = await confirm({
      title: approve ? `Approve ${rider.name}?` : `Reject ${rider.name}'s application?`,
      message: approve ? 'They will be able to go online and accept deliveries.' : 'They will be told the application was not approved.',
      confirmLabel: approve ? 'Approve rider' : 'Reject',
      danger: !approve,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_review_rider_application', { p_application_id: a.id, p_approve: approve });
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast(approve ? 'Rider approved' : 'Application rejected');
    onChanged();
  };

  const setSuspended = async (suspended: boolean) => {
    if (!u) return;
    if (suspended) {
      const ok = await confirm({ title: `Suspend ${rider.name}?`, message: 'They will be signed out of deliveries until you reactivate them.', confirmLabel: 'Suspend', danger: true });
      if (!ok) return;
    }
    setBusy(true);
    const { error } = await supabase.from('users').update({ is_suspended: suspended, ...(suspended ? { is_available: false, is_online: false } : {}) }).eq('id', u.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast(suspended ? 'Rider suspended' : 'Rider reactivated');
    onChanged();
  };

  const earned = Number(s?.order_earnings || 0) + Number(s?.logistics_earnings || 0);

  return (
    <Drawer
      open
      onClose={onClose}
      title={rider.name}
      width="max-w-2xl"
      footer={
        <>
          {a?.status === 'pending' && (
            <>
              <Button variant="danger" disabled={busy} onClick={() => review(false)}>Reject</Button>
              <Button disabled={busy} onClick={() => review(true)}>Approve rider</Button>
            </>
          )}
          {u && rider.status === 'active' && <Button variant="danger" disabled={busy} onClick={() => setSuspended(true)}>Suspend</Button>}
          {u && rider.status === 'suspended' && <Button variant="secondary" disabled={busy} onClick={() => setSuspended(false)}>Reactivate</Button>}
        </>
      }
    >
      <div className="space-y-6 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Deliveries" value={(Number(s?.deliveries || 0) + Number(s?.logistics_deliveries || 0)).toLocaleString()} />
          <Mini label="Earned" value={naira(earned)} />
          <Mini label="Paid out" value={naira(s?.paid_out)} />
          <Mini label="Owed" value={naira(Math.max(0, earned - Number(s?.paid_out || 0)))} hint={Number(s?.pending_withdrawals) ? `${naira(s?.pending_withdrawals)} requested` : undefined} />
        </div>

        <section className="space-y-2 rounded-lg border border-line p-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[rider.status]}>{rider.status}</Badge>
            {u?.is_online ? <Badge tone="ok">online</Badge> : <Badge>offline</Badge>}
            {u?.is_available && <Badge tone="info">available for orders</Badge>}
            {!!s?.active_orders && <Badge tone="brand">{s.active_orders} active order(s)</Badge>}
          </div>
          {(u?.phone || a?.phone) && <div className="flex items-center gap-2"><Phone className="size-4 text-ink-3" />{u?.phone || a?.phone}</div>}
          {(u?.email || a?.email) && <div className="flex items-center gap-2"><Mail className="size-4 text-ink-3" />{u?.email || a?.email}</div>}
          {a?.address && <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-ink-3" />{a.address}</div>}
          {u?.last_location_update && (
            <div className="text-xs text-ink-3">
              Last location {timeAgo(u.last_location_update)}
              {u.current_latitude && u.current_longitude && (
                <> · <a className="text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${u.current_latitude},${u.current_longitude}`}>Open map</a></>
              )}
            </div>
          )}
          <div className="text-xs text-ink-3">
            Joined {dateOnly(u?.created_at || a?.created_at)}
            {s?.last_delivery_at ? ` · last delivery ${timeAgo(s.last_delivery_at)}` : ''}
            {u?.rider_rating ? ` · ${Number(u.rider_rating).toFixed(1)}★ from ${u.rider_review_count || 0} reviews` : ''}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Vehicle & documents</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line p-4">
            <Info label="Vehicle" value={titleCase(u?.vehicle_type || a?.vehicle_type)} />
            <Info label="Plate number" value={u?.vehicle_number || a?.vehicle_number} />
            <Info label="Ownership" value={titleCase(u?.vehicle_ownership || a?.vehicle_ownership)} />
            <Info label="License number" value={u?.license_number || a?.license_number} />
          </dl>
          {(a?.license_photo_url || a?.id_card_url) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {a.license_photo_url && <DocLink href={a.license_photo_url} label="Driver's license" />}
              {a.id_card_url && <DocLink href={a.id_card_url} label="ID card" />}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Bank account</h3>
          <div className="rounded-lg border border-line p-4">
            {u?.account_number || a?.account_number ? (
              <>{u?.account_name || a?.account_name} · {u?.bank_name || a?.bank_name} · {u?.account_number || a?.account_number}</>
            ) : (
              <span className="text-ink-3">Not added</span>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Deliveries ({(orderTotal ?? 0).toLocaleString()})</h3>
          {orders.length === 0 ? (
            <p className="text-ink-3">No deliveries yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <Table head={<tr><Th>Order</Th><Th>Vendor</Th><Th>Distance</Th><Th>Earned</Th><Th>Status</Th></tr>}>
                {orders.map(o => (
                  <tr key={o.id}>
                    <Td><div className="font-medium">#{o.order_number || o.id.slice(0, 8)}</div><div className="text-xs text-ink-3">{dateTime(o.delivered_at || o.created_at)}</div></Td>
                    <Td>{o.vendor?.name || '—'}</Td>
                    <Td>{o.distance_km ? `${Number(o.distance_km).toFixed(1)} km` : '—'}</Td>
                    <Td>{naira(o.rider_earnings)}</Td>
                    <Td className="capitalize">{o.status.replace(/_/g, ' ')}</Td>
                  </tr>
                ))}
              </Table>
              <LoadMore shown={orders.length} total={orderTotal} loading={loadingMore} onClick={loadMore} />
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Payouts ({payouts.length})</h3>
          {payouts.length === 0 ? (
            <p className="text-ink-3">No payouts recorded.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {payouts.map(p => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="font-medium">{naira(p.amount)}</div>
                    <div className="text-xs text-ink-3">{dateTime(p.processed_at || p.created_at)}{p.reference ? ` · ${p.reference}` : ''}</div>
                  </div>
                  <Badge tone={p.status === 'completed' ? 'ok' : p.status === 'failed' ? 'bad' : 'warn'}>{p.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-warn">{hint}</div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  const safe = /^https:\/\//.test(href) ? href : undefined;
  if (!safe) return null;
  return (
    <a href={safe} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2">
      <FileText className="size-4 text-ink-3" />{label}
    </a>
  );
}
