import { useCallback, useEffect, useState } from 'react';
import { Crown, Download, Search, Users } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../components/Toast';
import { PeriodPicker } from '../../components/PeriodPicker';
import { Badge, Button, Card, Drawer, EmptyState, Input, LoadMore, OrderStatusBadge, PageHeader, Select, Spinner, Table, Tabs, Td, Th } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { dateOnly, dateTime, naira } from '../../lib/format';
import { ALL_TIME, applyPeriod, type Period } from '../../lib/period';
import { downloadCsv } from '../../lib/csv';
import type { Role } from '../../lib/types';

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_suspended: boolean | null;
  created_at: string;
  address?: string | null;
}

interface Sub {
  id: string;
  user_id: string;
  plan: 'monthly' | 'yearly';
  status: string;
  amount: number;
  payment_status: string;
  payment_reference: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

type Filter = 'all' | Role;
type Plan = 'any' | 'pro' | 'free';

const ROLE_TONE: Record<Role, 'neutral' | 'brand' | 'info' | 'ok' | 'warn'> = {
  customer: 'neutral',
  vendor: 'brand',
  admin: 'info',
  rider: 'ok',
  business: 'warn',
};
const ROLES: Filter[] = ['all', 'customer', 'vendor', 'rider', 'business', 'admin'];
const PAGE = 100;

const clean = (s: string) => s.trim().replace(/[,()%*\\]/g, ' ');

export function AdminUsers() {
  const { profile } = useAuth();
  const { toast, confirm } = useFeedback();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<Partial<Record<Filter, number>>>({});
  const [proUntil, setProUntil] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [plan, setPlan] = useState<Plan>('any');
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<UserRow | null>(null);

  // Users with an active, paid Pro plan right now.
  const loadPro = useCallback(async () => {
    const { data } = await supabase
      .from('subscriptions')
      .select('user_id, expires_at')
      .eq('status', 'active')
      .eq('payment_status', 'paid')
      .gt('expires_at', new Date().toISOString());
    const map = new Map<string, string>();
    (data || []).forEach(s => {
      const prev = map.get(s.user_id);
      if (!prev || prev < s.expires_at) map.set(s.user_id, s.expires_at);
    });
    setProUntil(map);
    return map;
  }, []);

  const buildQuery = useCallback((pro: Map<string, string>, head = false) => {
    let q = supabase
      .from('users')
      .select('id, name, email, phone, role, is_suspended, created_at, address', { count: 'exact', head })
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('role', filter);
    q = applyPeriod(q, period);
    const term = clean(query);
    if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
    const ids = [...pro.keys()];
    if (plan === 'pro') q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    if (plan === 'free' && ids.length) q = q.not('id', 'in', `(${ids.join(',')})`);
    return q;
  }, [filter, period, query, plan]);

  const load = useCallback(async () => {
    setLoading(true);
    const pro = await loadPro();
    const { data, error, count } = await buildQuery(pro).range(0, PAGE - 1);
    if (error) toast(error.message, 'error');
    setUsers((data as UserRow[]) || []);
    setTotal(count ?? null);
    setLoading(false);
    const roleCounts = await Promise.all(
      ROLES.map(r => {
        let q = supabase.from('users').select('id', { count: 'exact', head: true });
        if (r !== 'all') q = q.eq('role', r);
        return q;
      })
    );
    setCounts(Object.fromEntries(ROLES.map((r, i) => [r, roleCounts[i].count || 0])));
  }, [buildQuery, loadPro, toast]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await buildQuery(proUntil).range(users.length, users.length + PAGE - 1);
    setUsers(prev => [...prev, ...((data as UserRow[]) || [])]);
    setLoadingMore(false);
  };

  const exportCsv = async () => {
    const { data, error } = await buildQuery(proUntil).range(0, 9999);
    if (error) return toast(error.message, 'error');
    downloadCsv('vesphe-users.csv', ((data as UserRow[]) || []).map(u => ({
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      plan: proUntil.has(u.id) ? 'pro' : 'free',
      pro_until: proUntil.get(u.id) || '',
      status: u.is_suspended ? 'suspended' : 'active',
      joined: u.created_at,
    })));
  };

  const toggleSuspend = async (user: UserRow) => {
    const suspending = !user.is_suspended;
    if (suspending) {
      const ok = await confirm({
        title: `Suspend ${user.name}?`,
        message: 'They will be locked out of the Vesphe apps until you reactivate them.',
        confirmLabel: 'Suspend',
        danger: true,
      });
      if (!ok) return;
    }
    const { error } = await supabase.from('users').update({ is_suspended: suspending }).eq('id', user.id);
    if (error) return toast(error.message, 'error');
    toast(suspending ? `${user.name} suspended` : `${user.name} reactivated`);
    setSelected(s => (s?.id === user.id ? { ...s, is_suspended: suspending } : s));
    load();
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={`Everyone with a Vesphe account · ${proUntil.size} on Pro right now`}
        actions={<Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Export CSV</Button>}
      />
      <div className="mb-4 space-y-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={ROLES.map(f => ({
            value: f,
            label: f === 'all' ? 'All' : `${f[0].toUpperCase()}${f.slice(1)}s`,
            count: counts[f],
          }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input placeholder="Name, email or phone" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
          </div>
          <Select value={plan} onChange={e => setPlan(e.target.value as Plan)} className="w-36" aria-label="Plan">
            <option value="any">Any plan</option>
            <option value="pro">Pro</option>
            <option value="free">Free</option>
          </Select>
          <span className="text-xs text-ink-3">Joined:</span>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>
      <Card>
        {loading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState icon={<Users className="size-8" />} title="No users match" />
        ) : (
          <>
            <Table
              head={
                <tr>
                  <Th>Name</Th>
                  <Th>Contact</Th>
                  <Th>Role</Th>
                  <Th>Plan</Th>
                  <Th>Joined</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              }
            >
              {users.map(u => (
                <tr key={u.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(u)}>
                  <Td className="font-medium">{u.name}</Td>
                  <Td className="text-ink-2">
                    <div>{u.email}</div>
                    <div className="text-xs text-ink-3">{u.phone}</div>
                  </Td>
                  <Td><Badge tone={ROLE_TONE[u.role] || 'neutral'}>{u.role}</Badge></Td>
                  <Td>
                    {proUntil.has(u.id) ? (
                      <span title={`Until ${dateOnly(proUntil.get(u.id))}`}><Badge tone="brand"><Crown className="size-3" />Pro</Badge></span>
                    ) : (
                      <span className="text-xs text-ink-3">Free</span>
                    )}
                  </Td>
                  <Td className="text-ink-2">{dateOnly(u.created_at)}</Td>
                  <Td>{u.is_suspended ? <Badge tone="bad">suspended</Badge> : <Badge tone="ok">active</Badge>}</Td>
                  <Td className="text-right">
                    <div onClick={e => e.stopPropagation()} className="inline-flex">
                      {u.id !== profile?.id && u.role !== 'admin' && (
                        <Button size="sm" variant={u.is_suspended ? 'secondary' : 'danger'} onClick={() => toggleSuspend(u)}>
                          {u.is_suspended ? 'Reactivate' : 'Suspend'}
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <LoadMore shown={users.length} total={total} loading={loadingMore} onClick={loadMore} />
          </>
        )}
      </Card>

      {selected && <UserDrawer key={selected.id} user={selected} proUntil={proUntil.get(selected.id)} onClose={() => setSelected(null)} />}
    </div>
  );
}

interface UserOrder {
  id: string;
  order_number: string | null;
  status: string;
  total: number;
  payment_method: string;
  created_at: string;
  vendor: { name: string } | null;
}

function UserDrawer({ user, proUntil, onClose }: { user: UserRow; proUntil?: string; onClose: () => void }) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchOrders = useCallback(
    (from: number) =>
      supabase
        .from('orders')
        .select('id, order_number, status, total, payment_method, created_at, vendor:vendor_id(name)', { count: 'exact' })
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + 24),
    [user.id]
  );

  useEffect(() => {
    supabase.from('subscriptions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => setSubs((data as Sub[]) || []));
    fetchOrders(0).then(({ data, count }) => {
      setOrders((data as unknown as UserOrder[]) || []);
      setOrderCount(count ?? null);
    });
    supabase.from('orders').select('total').eq('customer_id', user.id).neq('status', 'cancelled')
      .then(({ data }) => setSpent((data || []).reduce((s, o) => s + (Number(o.total) || 0), 0)));
  }, [user.id, fetchOrders]);

  const proPaid = subs.filter(s => s.payment_status === 'paid').reduce((s, x) => s + (x.amount || 0), 0);

  return (
    <Drawer open onClose={onClose} title={user.name} width="max-w-2xl">
      <div className="space-y-6 text-sm">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Orders" value={(orderCount ?? 0).toLocaleString()} />
          <Mini label="Spent on food" value={naira(spent)} />
          <Mini label="Paid for Pro" value={naira(proPaid)} />
          <Mini label="Plan" value={proUntil ? `Pro until ${dateOnly(proUntil)}` : 'Free'} />
        </div>

        <section className="space-y-1 rounded-lg border border-line p-4">
          <div><span className="text-ink-3">Email:</span> {user.email || '—'}</div>
          <div><span className="text-ink-3">Phone:</span> {user.phone || '—'}</div>
          {user.address && <div><span className="text-ink-3">Address:</span> {user.address}</div>}
          <div><span className="text-ink-3">Role:</span> {user.role} · <span className="text-ink-3">Joined</span> {dateTime(user.created_at)}</div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Pro payments ({subs.length})</h3>
          {subs.length === 0 ? (
            <p className="text-ink-3">Never subscribed.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <Table head={<tr><Th>Date</Th><Th>Plan</Th><Th>Amount</Th><Th>Period</Th><Th>Status</Th></tr>}>
                {subs.map(s => (
                  <tr key={s.id}>
                    <Td>{dateTime(s.created_at)}</Td>
                    <Td className="capitalize">{s.plan}</Td>
                    <Td>{naira(s.amount)}</Td>
                    <Td className="text-xs text-ink-2">{s.starts_at ? `${dateOnly(s.starts_at)} → ${dateOnly(s.expires_at)}` : '—'}</Td>
                    <Td><Badge tone={s.payment_status === 'paid' ? 'ok' : s.payment_status === 'failed' ? 'bad' : 'warn'}>{s.payment_status}</Badge></Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Orders</h3>
          {orders.length === 0 ? (
            <p className="text-ink-3">No orders.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <Table head={<tr><Th>Order</Th><Th>Vendor</Th><Th>Total</Th><Th>Status</Th></tr>}>
                {orders.map(o => (
                  <tr key={o.id}>
                    <Td><div className="font-medium">#{o.order_number || o.id.slice(0, 8)}</div><div className="text-xs text-ink-3">{dateTime(o.created_at)} · {o.payment_method}</div></Td>
                    <Td>{o.vendor?.name || '—'}</Td>
                    <Td>{naira(o.total)}</Td>
                    <Td><OrderStatusBadge status={o.status} /></Td>
                  </tr>
                ))}
              </Table>
              <LoadMore
                shown={orders.length}
                total={orderCount}
                loading={loadingMore}
                onClick={async () => {
                  setLoadingMore(true);
                  const { data } = await fetchOrders(orders.length);
                  setOrders(prev => [...prev, ...((data as unknown as UserOrder[]) || [])]);
                  setLoadingMore(false);
                }}
              />
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
