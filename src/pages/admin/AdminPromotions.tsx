import { useCallback, useEffect, useMemo, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Field, PageHeader, Spinner, Table, Tabs, Td, Textarea, Th } from '../../components/ui';
import { fetchAll, supabase } from '../../lib/supabase';
import { dateOnly, naira, titleCase } from '../../lib/format';

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  promotion_type: string;
  status: string;
  payment_status: string | null;
  payment_amount: number;
  days_count: number;
  start_date: string;
  end_date: string;
  rejection_reason: string | null;
  clicks: number | null;
  views: number | null;
  created_at: string;
  vendor?: { name: string } | null;
}

type Filter = 'pending_approval' | 'active' | 'other' | 'all';

const STATUS_TONE: Record<string, 'warn' | 'ok' | 'bad' | 'neutral' | 'info'> = {
  pending_approval: 'warn',
  pending_payment: 'neutral',
  active: 'ok',
  rejected: 'bad',
  expired: 'neutral',
};

export function AdminPromotions() {
  const { profile } = useAuth();
  const { toast } = useFeedback();
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending_approval');
  const [selected, setSelected] = useState<Promotion | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchAll<Promotion>((from, to) =>
      supabase
        .from('promotions')
        .select('*, vendor:vendor_id(name)')
        .order('created_at', { ascending: false })
        .range(from, to)
    );
    if (error) toast(error.message, 'error');
    setPromos((data as Promotion[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      promos.filter(p =>
        filter === 'all' ? true : filter === 'other' ? !['pending_approval', 'active'].includes(p.status) : p.status === filter
      ),
    [promos, filter]
  );

  const decide = async (promo: Promotion, decision: 'active' | 'rejected') => {
    if (decision === 'rejected' && !reason.trim()) return toast('Write a reason for the vendor', 'error');
    setBusy(true);
    const now = new Date();
    const changes: Record<string, unknown> =
      decision === 'active'
        ? {
            status: 'active',
            approved_by: profile?.id,
            approved_at: now.toISOString(),
            // The paid days start counting from approval.
            start_date: now.toISOString(),
            end_date: new Date(now.getTime() + promo.days_count * 86400000).toISOString(),
          }
        : { status: 'rejected', rejection_reason: reason.trim(), approved_by: profile?.id, approved_at: now.toISOString() };
    const { error } = await supabase.from('promotions').update(changes).eq('id', promo.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast(decision === 'active' ? 'Promotion is live' : 'Promotion rejected');
    setSelected(null);
    load();
  };

  return (
    <div>
      <PageHeader title="Promotions" subtitle="Paid banner promotions from vendors. Approve to put them live." />

      <div className="mb-4">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending_approval', label: 'To approve', count: promos.filter(p => p.status === 'pending_approval').length },
            { value: 'active', label: 'Live', count: promos.filter(p => p.status === 'active').length },
            { value: 'other', label: 'Other' },
            { value: 'all', label: 'All', count: promos.length },
          ]}
        />
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Megaphone className="size-8" />} title="No promotions here" />
        ) : (
          <Table
            head={
              <tr>
                <Th>Promotion</Th>
                <Th>Vendor</Th>
                <Th>Paid</Th>
                <Th>Days</Th>
                <Th>Performance</Th>
                <Th>Status</Th>
              </tr>
            }
          >
            {visible.map(p => (
              <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => { setSelected(p); setReason(''); }}>
                <Td>
                  <div className="flex items-center gap-3">
                    <img src={p.image_url} alt="" className="h-10 w-16 rounded-md object-cover" />
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-ink-3">{titleCase(p.promotion_type)}</div>
                    </div>
                  </div>
                </Td>
                <Td>{p.vendor?.name || '—'}</Td>
                <Td>
                  {naira(p.payment_amount)}{' '}
                  <Badge tone={p.payment_status === 'paid' ? 'ok' : 'warn'}>{p.payment_status || 'unpaid'}</Badge>
                </Td>
                <Td>{p.days_count}</Td>
                <Td className="text-ink-2">{p.views || 0} views · {p.clicks || 0} clicks</Td>
                <Td><Badge tone={STATUS_TONE[p.status] || 'neutral'}>{titleCase(p.status)}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title={selected.title}
          footer={
            selected.status === 'pending_approval' && (
              <>
                <Button variant="danger" disabled={busy} onClick={() => decide(selected, 'rejected')}>Reject</Button>
                <Button disabled={busy || selected.payment_status !== 'paid'} onClick={() => decide(selected, 'active')}>Approve & go live</Button>
              </>
            )
          }
        >
          <div className="space-y-4 text-sm">
            <img src={selected.image_url} alt="" className="w-full rounded-xl object-cover" />
            <div className="flex flex-wrap gap-2">
              <Badge>{selected.vendor?.name}</Badge>
              <Badge>{titleCase(selected.promotion_type)}</Badge>
              <Badge tone={selected.payment_status === 'paid' ? 'ok' : 'warn'}>{naira(selected.payment_amount)} {selected.payment_status || 'unpaid'}</Badge>
              <Badge>{selected.days_count} days</Badge>
            </div>
            {selected.description && <p className="text-ink-2">{selected.description}</p>}
            <p className="text-ink-3">Runs {dateOnly(selected.start_date)} – {dateOnly(selected.end_date)}</p>
            {selected.payment_status !== 'paid' && selected.status === 'pending_approval' && (
              <p className="text-warn">Payment not confirmed yet, so it can't go live.</p>
            )}
            {selected.status === 'pending_approval' && (
              <Field label="Reason (if rejecting)">
                <Textarea value={reason} onChange={e => setReason(e.target.value)} />
              </Field>
            )}
            {selected.rejection_reason && <p className="text-bad">Rejected: {selected.rejection_reason}</p>}
          </div>
        </Drawer>
      )}
    </div>
  );
}
