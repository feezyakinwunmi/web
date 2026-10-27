import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MessageSquareWarning, RotateCcw, Search, XCircle } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { ComplaintThread, type Complaint } from '../../components/ComplaintThread';
import { Badge, Button, Card, EmptyState, Input, LoadMore, PageHeader, Spinner, Tabs, cx } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { dateTime, timeAgo, titleCase } from '../../lib/format';

type Filter = 'pending' | 'resolved' | 'rejected' | 'all';
const PAGE = 100;

export const COMPLAINT_TONE = { pending: 'warn', resolved: 'ok', rejected: 'bad' } as const;

export function AdminComplaints() {
  const { toast, confirm } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Complaint[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<Filter, number>>({ pending: 0, resolved: 0, rejected: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'));
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(async (from: number) => {
    let q = supabase.from('complaints').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const term = query.trim().replace(/[,()%*\\]/g, ' ');
    if (term) q = q.or(`title.ilike.%${term}%,user_name.ilike.%${term}%,order_id.ilike.%${term}%`);
    return q.range(from, from + PAGE - 1);
  }, [filter, query]);

  const loadCounts = useCallback(async () => {
    const statuses: Filter[] = ['pending', 'resolved', 'rejected'];
    const results = await Promise.all(
      statuses.map(s => supabase.from('complaints').select('id', { count: 'exact', head: true }).eq('status', s))
    );
    const next = { pending: 0, resolved: 0, rejected: 0, all: 0 } as Record<Filter, number>;
    statuses.forEach((s, i) => (next[s] = results[i].count || 0));
    next.all = next.pending + next.resolved + next.rejected;
    setCounts(next);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error, count } = await fetchPage(0);
    if (error) toast(error.message, 'error');
    setItems((data as Complaint[]) || []);
    setTotal(count ?? null);
    setLoading(false);
    loadCounts();
  }, [fetchPage, loadCounts, toast]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  // Live: new complaints and status changes.
  useEffect(() => {
    const channel = supabase
      .channel('admin-complaints')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Opened from a notification: /admin/complaints?id=<id>, even if it's not in the current tab.
  const [linked, setLinked] = useState<Complaint | null>(null);
  useEffect(() => {
    const id = params.get('id');
    if (!id) return;
    setSelectedId(id);
    supabase.from('complaints').select('*').eq('id', id).maybeSingle().then(({ data }) => setLinked((data as Complaint) || null));
    setParams({}, { replace: true });
  }, [params, setParams]);

  const selected = useMemo(
    () => items.find(c => c.id === selectedId) || (linked?.id === selectedId ? linked : null),
    [items, selectedId, linked]
  );

  const loadMore = async () => {
    setLoadingMore(true);
    const { data } = await fetchPage(items.length);
    setItems(prev => [...prev, ...((data as Complaint[]) || [])]);
    setLoadingMore(false);
  };

  const setStatus = async (c: Complaint, status: Complaint['status']) => {
    if (status !== 'pending') {
      const ok = await confirm({
        title: status === 'resolved' ? 'Mark as resolved?' : 'Close without resolving?',
        message: `${c.user_name || 'The user'} will be notified. They can't reply after it's closed, but you can reopen it.`,
        confirmLabel: status === 'resolved' ? 'Mark resolved' : 'Close complaint',
        danger: status === 'rejected',
      });
      if (!ok) return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('complaints')
      .update({ status, resolved_at: status === 'pending' ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', c.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast(status === 'pending' ? 'Complaint reopened' : status === 'resolved' ? 'Marked as resolved' : 'Complaint closed');
    if (linked?.id === c.id) setLinked({ ...c, status });
    load();
  };

  return (
    <div>
      <PageHeader title="Complaints" subtitle="Chat with customers, vendors and riders about their issues." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: 'Open', count: counts.pending },
            { value: 'resolved', label: 'Resolved', count: counts.resolved },
            { value: 'rejected', label: 'Closed', count: counts.rejected },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Title, name or order #" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className={cx('overflow-hidden', selected && 'hidden lg:block')}>
          {loading ? (
            <Spinner label="Loading complaints…" />
          ) : items.length === 0 ? (
            <EmptyState icon={<MessageSquareWarning className="size-8" />} title="No complaints here" />
          ) : (
            <>
              <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto">
                {items.map(c => (
                  <li key={c.id}>
                    <button
                      onClick={() => setSelectedId(c.id)}
                      className={cx('w-full px-4 py-3 text-left hover:bg-surface-2', c.id === selectedId && 'bg-surface-2')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{c.title}</span>
                        <Badge tone={COMPLAINT_TONE[c.status] || 'neutral'}>{c.status === 'pending' ? 'open' : c.status === 'rejected' ? 'closed' : c.status}</Badge>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-2">
                        {c.user_name || 'User'} · {titleCase(c.user_role)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-3">{timeAgo(c.last_message_at || c.created_at)}</div>
                    </button>
                  </li>
                ))}
              </ul>
              <LoadMore shown={items.length} total={total} loading={loadingMore} onClick={loadMore} />
            </>
          )}
        </Card>

        {selected ? (
          <Card className="flex h-[70vh] min-h-[28rem] flex-col overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <button className="mb-1 text-xs text-brand lg:hidden" onClick={() => setSelectedId(null)}>← All complaints</button>
                <div className="font-semibold">{selected.title}</div>
                <div className="mt-0.5 text-xs text-ink-2">
                  {selected.user_name || 'User'} · {titleCase(selected.user_role)} · opened {dateTime(selected.created_at)}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  {selected.order_id && (
                    <Link to={`/admin/orders?order=${encodeURIComponent(selected.order_id)}`} className="text-brand hover:underline">
                      Order {selected.order_id}
                    </Link>
                  )}
                  {selected.vendor_name && <span className="text-ink-3">Vendor: {selected.vendor_name}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.status === 'pending' ? (
                  <>
                    <Button size="sm" variant="success" disabled={busy} icon={<CheckCircle2 className="size-4" />} onClick={() => setStatus(selected, 'resolved')}>Resolve</Button>
                    <Button size="sm" variant="danger" disabled={busy} icon={<XCircle className="size-4" />} onClick={() => setStatus(selected, 'rejected')}>Close</Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy} icon={<RotateCcw className="size-4" />} onClick={() => setStatus(selected, 'pending')}>Reopen</Button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <ComplaintThread key={selected.id} complaint={selected} />
            </div>
          </Card>
        ) : (
          <Card className="hidden lg:flex lg:items-center lg:justify-center">
            <EmptyState icon={<MessageSquareWarning className="size-8" />} title="Pick a complaint" text="Open a complaint on the left to read and reply." />
          </Card>
        )}
      </div>
    </div>
  );
}
