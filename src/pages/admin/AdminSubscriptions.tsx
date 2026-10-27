import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Download, RefreshCw, Search } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { PeriodPicker } from '../../components/PeriodPicker';
import { Badge, Button, Card, EmptyState, Input, LoadMore, PageHeader, Select, Spinner, StatCard, Table, Td, Th } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { dateOnly, dateTime, naira } from '../../lib/format';
import { ALL_TIME, applyPeriod, periodLabel, type Period } from '../../lib/period';
import { downloadCsv } from '../../lib/csv';

interface Sub {
  id: string;
  user_id: string;
  plan: 'monthly' | 'yearly';
  tier: 'pro' | 'pro_max';
  status: 'pending' | 'active' | 'expired' | 'failed';
  amount: number;
  payment_status: string;
  payment_reference: string | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Person {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

type PlanFilter = 'all' | 'monthly' | 'yearly';
type TierFilter = 'all' | 'pro' | 'pro_max';
type PayFilter = 'paid' | 'pending' | 'failed' | 'all';
type StateFilter = 'all' | 'current' | 'ended';

const PAGE = 100;

// A paid plan whose end date has passed is shown as ended, whatever its stored status.
const isCurrent = (s: Sub) => s.payment_status === 'paid' && s.status === 'active' && !!s.expires_at && new Date(s.expires_at) > new Date();

export function AdminSubscriptions() {
  const { toast } = useFeedback();
  const [subs, setSubs] = useState<Sub[]>([]);
  const [people, setPeople] = useState<Map<string, Person>>(new Map());
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [plan, setPlan] = useState<PlanFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [pay, setPay] = useState<PayFilter>('paid');
  const [state, setState] = useState<StateFilter>('all');
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState({ revenue: 0, payments: 0, monthly: 0, yearly: 0, activeNow: 0, monthlyActive: 0, yearlyActive: 0, proMaxNow: 0, mrr: 0, customers: 0 });
  const [prices, setPrices] = useState<{ monthly: number; yearly: number }>({ monthly: 0, yearly: 0 });

  const buildQuery = useCallback(() => {
    let q = supabase.from('subscriptions').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    q = applyPeriod(q, period);
    if (plan !== 'all') q = q.eq('plan', plan);
    if (tierFilter !== 'all') q = q.eq('tier', tierFilter);
    if (pay !== 'all') q = q.eq('payment_status', pay);
    const now = new Date().toISOString();
    if (state === 'current') q = q.eq('status', 'active').eq('payment_status', 'paid').gt('expires_at', now);
    if (state === 'ended') q = q.or(`status.eq.expired,expires_at.lte.${now}`);
    return q;
  }, [period, plan, tierFilter, pay, state]);

  const loadPeople = async (rows: Sub[], known: Map<string, Person>) => {
    const ids = [...new Set(rows.map(r => r.user_id))].filter(id => !known.has(id));
    if (!ids.length) return known;
    const { data } = await supabase.from('users').select('id, name, email, phone').in('id', ids);
    const next = new Map(known);
    (data as Person[] || []).forEach(p => next.set(p.id, p));
    return next;
  };

  const loadSummary = useCallback(async () => {
    let q = supabase.from('subscriptions').select('plan, amount').eq('payment_status', 'paid');
    q = applyPeriod(q, period);
    const [{ data: paid }, { data: active }, { count: customers }, { data: settings }] = await Promise.all([
      q,
      supabase.from('subscriptions').select('user_id, plan, tier, amount').eq('status', 'active').eq('payment_status', 'paid').gt('expires_at', new Date().toISOString()),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('platform_settings').select('pro_monthly_price, pro_yearly_price').limit(1).maybeSingle(),
    ]);
    const rows = paid || [];
    const activeRows = active || [];
    setSummary({
      revenue: rows.reduce((s, r) => s + (r.amount || 0), 0),
      payments: rows.length,
      monthly: rows.filter(r => r.plan === 'monthly').reduce((s, r) => s + (r.amount || 0), 0),
      yearly: rows.filter(r => r.plan === 'yearly').reduce((s, r) => s + (r.amount || 0), 0),
      activeNow: new Set(activeRows.map(r => r.user_id)).size,
      monthlyActive: activeRows.filter(r => r.plan === 'monthly').length,
      yearlyActive: activeRows.filter(r => r.plan === 'yearly').length,
      proMaxNow: new Set(activeRows.filter(r => r.tier === 'pro_max').map(r => r.user_id)).size,
      // Monthly equivalent of what active members paid (yearly plans spread over 12 months).
      mrr: activeRows.reduce((sum, r) => sum + (r.plan === 'yearly' ? Math.round((r.amount || 0) / 12) : r.amount || 0), 0),
      customers: customers || 0,
    });
    setPrices({ monthly: settings?.pro_monthly_price || 0, yearly: settings?.pro_yearly_price || 0 });
  }, [period]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error, count } = await buildQuery().range(0, PAGE - 1);
    if (error) toast(error.message, 'error');
    const rows = (data as Sub[]) || [];
    setPeople(await loadPeople(rows, new Map()));
    setSubs(rows);
    setTotal(count ?? null);
    setLoading(false);
    loadSummary();
  }, [buildQuery, loadSummary, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await buildQuery().range(subs.length, subs.length + PAGE - 1);
    const rows = (data as Sub[]) || [];
    setPeople(await loadPeople(rows, people));
    setSubs(prev => [...prev, ...rows]);
    setLoadingMore(false);
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subs;
    return subs.filter(s => {
      const p = people.get(s.user_id);
      return (p?.name || '').toLowerCase().includes(q) || (p?.email || '').toLowerCase().includes(q) || (p?.phone || '').includes(q) || (s.payment_reference || '').toLowerCase().includes(q);
    });
  }, [subs, people, query]);

  const exportCsv = async () => {
    const { data, error } = await buildQuery().range(0, 9999);
    if (error) return toast(error.message, 'error');
    const rows = (data as Sub[]) || [];
    const map = await loadPeople(rows, people);
    downloadCsv('vesphe-pro-subscriptions.csv', rows.map(s => ({
      date: s.created_at,
      name: map.get(s.user_id)?.name,
      email: map.get(s.user_id)?.email,
      phone: map.get(s.user_id)?.phone,
      tier: s.tier === 'pro_max' ? 'Pro Max' : 'Pro',
      plan: s.plan,
      amount: s.amount,
      payment_status: s.payment_status,
      status: isCurrent(s) ? 'active' : s.status,
      starts_at: s.starts_at,
      expires_at: s.expires_at,
      reference: s.payment_reference,
    })));
  };

  // Recurring revenue if every current subscriber renews at today's prices.
  const mrr = summary.mrr;
  const conversion = summary.customers ? ((summary.activeNow / summary.customers) * 100).toFixed(1) : '0';

  return (
    <div>
      <PageHeader
        title="Pro subscriptions"
        subtitle="Who pays for Vesphe Pro, how much and until when."
        actions={
          <>
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Export CSV</Button>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Pro revenue · ${periodLabel(period)}`} value={naira(summary.revenue)} tone="brand" hint={`${summary.payments} payments · monthly ${naira(summary.monthly)} · yearly ${naira(summary.yearly)}`} />
        <StatCard label="Pro members now" value={summary.activeNow.toLocaleString()} hint={`${summary.proMaxNow} on Pro Max · ${summary.monthlyActive} monthly · ${summary.yearlyActive} yearly`} icon={<Crown className="size-4" />} />
        <StatCard label="Free customers" value={Math.max(0, summary.customers - summary.activeNow).toLocaleString()} hint={`${conversion}% of customers are on Pro`} />
        <StatCard label="Monthly recurring (est.)" value={naira(mrr)} hint={`From what active members paid · Pro ${naira(prices.monthly)}/month`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Name, email, phone or reference" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={tierFilter} onChange={e => setTierFilter(e.target.value as TierFilter)} className="w-36" aria-label="Tier">
          <option value="all">Pro + Pro Max</option>
          <option value="pro">Pro only</option>
          <option value="pro_max">Pro Max only</option>
        </Select>
        <Select value={plan} onChange={e => setPlan(e.target.value as PlanFilter)} className="w-36" aria-label="Plan">
          <option value="all">All plans</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </Select>
        <Select value={pay} onChange={e => setPay(e.target.value as PayFilter)} className="w-40" aria-label="Payment">
          <option value="paid">Paid</option>
          <option value="pending">Not completed</option>
          <option value="failed">Failed</option>
          <option value="all">Any payment</option>
        </Select>
        <Select value={state} onChange={e => setState(e.target.value as StateFilter)} className="w-36" aria-label="Status">
          <option value="all">Any status</option>
          <option value="current">Active now</option>
          <option value="ended">Ended</option>
        </Select>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading subscriptions…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Crown className="size-8" />} title="No subscriptions match" />
        ) : (
          <>
            <Table head={<tr><Th>Customer</Th><Th>Plan</Th><Th>Amount</Th><Th>Paid on</Th><Th>Covers</Th><Th>Status</Th></tr>}>
              {visible.map(s => {
                const p = people.get(s.user_id);
                const current = isCurrent(s);
                return (
                  <tr key={s.id}>
                    <Td>
                      <div className="font-medium">{p?.name || 'Deleted user'}</div>
                      <div className="text-xs text-ink-3">{p?.email || p?.phone}</div>
                    </Td>
                    <Td>
                      <Badge tone={s.tier === 'pro_max' ? 'info' : 'brand'}>{s.tier === 'pro_max' ? 'Pro Max' : 'Pro'}</Badge>
                      <div className="mt-0.5 text-xs capitalize text-ink-3">{s.plan}</div>
                    </Td>
                    <Td className="font-medium">{naira(s.amount)}</Td>
                    <Td className="text-ink-2">{dateTime(s.created_at)}<div className="text-[11px] text-ink-3">{s.payment_reference}</div></Td>
                    <Td className="text-xs text-ink-2">{s.starts_at ? `${dateOnly(s.starts_at)} → ${dateOnly(s.expires_at)}` : '—'}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={s.payment_status === 'paid' ? 'ok' : s.payment_status === 'failed' ? 'bad' : 'warn'}>{s.payment_status}</Badge>
                        {s.payment_status === 'paid' && <Badge tone={current ? 'brand' : 'neutral'}>{current ? 'active' : 'ended'}</Badge>}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </Table>
            {!query && <LoadMore shown={subs.length} total={total} loading={loadingMore} onClick={loadMore} />}
          </>
        )}
      </Card>
    </div>
  );
}
