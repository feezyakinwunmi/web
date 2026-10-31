import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike, Download, FileText, MapPin, Phone, Mail, Search, Star } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Input, LoadMore, Modal, PageHeader, Spinner, Table, Tabs, Td, Textarea, Th } from '../../components/ui';
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
  // Added by 20261101000000_rider_applications.sql
  date_of_birth: string | null;
  city: string | null;
  selfie_url: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
  vehicle_owner_name: string | null;
  vehicle_owner_phone: string | null;
  vehicle_photo_url: string | null;
  vehicle_papers_url: string | null;
  license_expiry: string | null;
  id_type: string | null;
  id_number: string | null;
  guarantor_name: string | null;
  guarantor_phone: string | null;
  guarantor_relationship: string | null;
  guarantor_address: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
}

const ID_TYPE_LABEL: Record<string, string> = {
  nin: 'NIN',
  voters_card: "Voter's card",
  passport: 'Passport',
  drivers_license: "Driver's licence",
};

const QUICK_REASONS = [
  'Photos are unclear',
  'ID does not match your details',
  'Licence is expired or invalid',
  'Vehicle papers missing or invalid',
  'Guarantor could not be reached',
];

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

// Same rule as the app (app/utils/riderPresence.ts): online = switch on AND the
// rider app checked in within 5 minutes (it sends a heartbeat every minute).
const PRESENCE_TIMEOUT_MS = 5 * 60 * 1000;
const isOnline = (u: RiderUser | null) =>
  !!u && !u.is_suspended && !!u.is_available && !!u.last_location_update &&
  Date.now() - new Date(u.last_location_update).getTime() < PRESENCE_TIMEOUT_MS;

// Application photos are stored as "public" storage links, which don't open when
// the rider-documents bucket is private. Swap them for 1-hour signed links.
const DOC_FIELDS = ['selfie_url', 'vehicle_photo_url', 'vehicle_papers_url', 'license_photo_url', 'id_card_url'] as const;
const DOC_PATH = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/rider-documents\/([^?]+)/;
const docPath = (url: string | null) => {
  const m = url?.match(DOC_PATH);
  return m ? decodeURIComponent(m[1]) : null;
};

async function withSignedDocuments(apps: Application[]): Promise<Application[]> {
  const paths = [...new Set(apps.flatMap(a => DOC_FIELDS.map(f => docPath(a[f]))).filter((p): p is string => !!p))];
  if (!paths.length) return apps;
  const { data } = await supabase.storage.from('rider-documents').createSignedUrls(paths, 60 * 60);
  const signed = new Map((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
  return apps.map(a => {
    const copy = { ...a };
    DOC_FIELDS.forEach(f => {
      const p = docPath(a[f]);
      if (p && signed.get(p)) copy[f] = signed.get(p)!;
    });
    return copy;
  });
}

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
    const applications = await withSignedDocuments((apps as Application[]) || []);
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
    f === 'all' ? riders.length : f === 'online' ? riders.filter(r => isOnline(r.user)).length : riders.filter(r => r.status === f).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return riders
      .filter(r => filter === 'all' || (filter === 'online' ? isOnline(r.user) : r.status === filter))
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
                      {u?.avatar_url || a?.selfie_url ? <img src={(u?.avatar_url || a?.selfie_url)!} alt="" className="size-9 rounded-full object-cover" /> : <div className="flex size-9 items-center justify-center rounded-full bg-surface-3"><Bike className="size-4 text-ink-3" /></div>}
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
                      {isOnline(u) && <Badge tone="ok">online</Badge>}
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

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<string | null>(null);

  const submitReview = async (approve: boolean) => {
    if (!a) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_review_rider_application', {
      p_application_id: a.id,
      p_approve: approve,
      p_reason: approve ? null : reason.trim(),
    });
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast(approve ? 'Rider approved' : 'Application rejected');
    setRejectOpen(false);
    onChanged();
  };

  const approve = async () => {
    const ok = await confirm({
      title: `Approve ${rider.name}?`,
      message: 'They will be able to go online and accept deliveries.',
      confirmLabel: 'Approve rider',
    });
    if (ok) submitReview(true);
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
              <Button variant="danger" disabled={busy} onClick={() => setRejectOpen(true)}>Reject</Button>
              <Button disabled={busy} onClick={approve}>Approve rider</Button>
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

        {a?.status === 'rejected' && a.rejection_reason && (
          <div className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-bad">
            Rejected{a.reviewed_at ? ` ${dateOnly(a.reviewed_at)}` : ''}: {a.rejection_reason}
          </div>
        )}

        <section className="space-y-2 rounded-lg border border-line p-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[rider.status]}>{rider.status}</Badge>
            {isOnline(u) ? <Badge tone="ok">online</Badge> : <Badge>offline</Badge>}
            {isOnline(u) && !s?.active_orders && <Badge tone="info">available for orders</Badge>}
            {!!s?.active_orders && <Badge tone="brand">{s.active_orders} active order(s)</Badge>}
          </div>
          {(u?.phone || a?.phone) && <div className="flex items-center gap-2"><Phone className="size-4 text-ink-3" />{u?.phone || a?.phone}</div>}
          {(u?.email || a?.email) && <div className="flex items-center gap-2"><Mail className="size-4 text-ink-3" />{u?.email || a?.email}</div>}
          {a?.address && <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-ink-3" />{[a.address, a.city].filter(Boolean).join(', ')}</div>}
          {a?.date_of_birth && <div className="text-xs text-ink-3">Born {dateOnly(a.date_of_birth)}</div>}
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
            <Info label="Make / model" value={[a?.vehicle_make, a?.vehicle_model].filter(Boolean).join(' ') || null} />
            <Info label="Year" value={a?.vehicle_year ? String(a.vehicle_year) : null} />
            <Info label="Colour" value={a?.vehicle_color} />
            <Info label="Plate number" value={u?.vehicle_number || a?.vehicle_number} />
            <Info label="Ownership" value={titleCase(u?.vehicle_ownership || a?.vehicle_ownership)} />
            {a?.vehicle_owner_name && <Info label="Vehicle owner" value={`${a.vehicle_owner_name}${a.vehicle_owner_phone ? ` · ${a.vehicle_owner_phone}` : ''}`} />}
            <Info label="License number" value={u?.license_number || a?.license_number} />
            <Info label="License expiry" value={a?.license_expiry ? dateOnly(a.license_expiry) : null} />
            <Info label="ID" value={a?.id_type ? `${ID_TYPE_LABEL[a.id_type] || a.id_type} · ${a.id_number || ''}` : null} />
          </dl>
          {a && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <DocThumb url={a.selfie_url} label="Selfie" onOpen={setPreview} />
              <DocThumb url={a.vehicle_photo_url} label="Vehicle" onOpen={setPreview} />
              <DocThumb url={a.vehicle_papers_url} label="Papers" onOpen={setPreview} />
              <DocThumb url={a.license_photo_url} label="Licence" onOpen={setPreview} />
              <DocThumb url={a.id_card_url} label="ID card" onOpen={setPreview} />
            </div>
          )}
        </section>

        {a?.guarantor_name && (
          <section>
            <h3 className="mb-2 font-semibold">Guarantor</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line p-4">
              <Info label="Name" value={a.guarantor_name} />
              <Info label="Relationship" value={a.guarantor_relationship} />
              <Info label="Phone" value={a.guarantor_phone} />
              <Info label="Address" value={a.guarantor_address} />
            </dl>
          </section>
        )}

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

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Reject ${rider.name}'s application`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => submitReview(false)}>Reject application</Button>
          </>
        }
      >
        <p className="mb-3">The applicant sees this reason and can fix it and apply again.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_REASONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1 text-xs ${reason === r ? 'border-bad bg-bad text-white' : 'border-line hover:bg-surface-2'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for rejecting" />
      </Modal>

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6" onClick={() => setPreview(null)}>
          <img src={preview} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
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

function DocThumb({ url, label, onOpen }: { url: string | null; label: string; onOpen: (url: string) => void }) {
  const safe = url && /^https:\/\//.test(url) ? url : null;
  return (
    <button
      type="button"
      disabled={!safe}
      onClick={() => safe && onOpen(safe)}
      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 disabled:cursor-default"
    >
      {safe ? <img src={safe} alt={label} className="size-full object-cover transition group-hover:scale-105" /> : <FileText className="size-5 text-ink-3" />}
      <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">{label}</span>
    </button>
  );
}
