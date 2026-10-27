import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LifeBuoy, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../components/Toast';
import { ComplaintThread, type Complaint } from '../../components/ComplaintThread';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, cx } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { dateTime, naira, timeAgo } from '../../lib/format';
import { COMPLAINT_TONE } from '../admin/AdminComplaints';

interface RecentOrder {
  id: string;
  order_number: string | null;
  customer_name: string | null;
  total: number;
  created_at: string;
}

export function VendorSupport() {
  const { profile, vendor } = useAuth();
  const { toast } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('id'));
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) toast(error.message, 'error');
    setItems((data as Complaint[]) || []);
    setLoading(false);
  }, [profile, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`vendor-complaints-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints', filter: `user_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, load]);

  useEffect(() => {
    const id = params.get('id');
    if (id) {
      setSelectedId(id);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const selected = items.find(c => c.id === selectedId) || null;

  return (
    <div>
      <PageHeader
        title="Support"
        subtitle="Report a problem with an order, payment or your account and chat with the Vesphe team."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setShowNew(true)}>New complaint</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card className={cx('overflow-hidden', selected && 'hidden lg:block')}>
          {loading ? (
            <Spinner label="Loading…" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<LifeBuoy className="size-8" />}
              title="No complaints yet"
              text="If something goes wrong with an order or payout, open a complaint and we'll reply here."
            />
          ) : (
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
                    <div className="mt-0.5 text-[11px] text-ink-3">{timeAgo(c.last_message_at || c.created_at)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card className="flex h-[70vh] min-h-[28rem] flex-col overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <button className="mb-1 text-xs text-brand lg:hidden" onClick={() => setSelectedId(null)}>← All complaints</button>
              <div className="font-semibold">{selected.title}</div>
              <div className="mt-0.5 text-xs text-ink-2">
                Opened {dateTime(selected.created_at)}{selected.order_id ? ` · Order ${selected.order_id}` : ''}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <ComplaintThread key={selected.id} complaint={selected} />
            </div>
          </Card>
        ) : (
          <Card className="hidden lg:flex lg:items-center lg:justify-center">
            <EmptyState icon={<LifeBuoy className="size-8" />} title="Pick a complaint" text="Choose one on the left, or open a new complaint." />
          </Card>
        )}
      </div>

      {showNew && profile && (
        <NewComplaint
          onClose={() => setShowNew(false)}
          onCreated={id => {
            setShowNew(false);
            setSelectedId(id);
            load();
          }}
          vendorId={vendor?.id || null}
          vendorName={vendor?.name || null}
          userId={profile.id}
          userName={vendor?.name || profile.name}
        />
      )}
    </div>
  );
}

function NewComplaint({ onClose, onCreated, vendorId, vendorName, userId, userName }: {
  onClose: () => void;
  onCreated: (id: string) => void;
  vendorId: string | null;
  vendorName: string | null;
  userId: string;
  userName: string;
}) {
  const { toast } = useFeedback();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [orderId, setOrderId] = useState('');
  const [orders, setOrders] = useState<RecentOrder[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!vendorId) return;
    supabase
      .from('orders')
      .select('id, order_number, customer_name, total, created_at')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setOrders((data as RecentOrder[]) || []));
  }, [vendorId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return toast('Add a title and describe the problem', 'error');
    setSaving(true);
    const { data, error } = await supabase
      .from('complaints')
      .insert({
        user_id: userId,
        user_name: userName,
        user_role: 'vendor',
        vendor_id: vendorId,
        vendor_name: vendorName,
        order_id: orderId || null,
        title: title.trim(),
        description: description.trim(),
        status: 'pending',
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) return toast(error.message, 'error');
    toast("Complaint sent. We'll reply here.");
    onCreated(data.id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="New complaint"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit}>Send</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="What's it about?">
          <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Payout not received" autoFocus />
        </Field>
        {orders.length > 0 && (
          <Field label="Order (optional)">
            <Select value={orderId} onChange={e => setOrderId(e.target.value)}>
              <option value="">Not about a specific order</option>
              {orders.map(o => (
                <option key={o.id} value={o.order_number || o.id}>
                  #{o.order_number || o.id.slice(0, 8)} · {o.customer_name || 'Customer'} · {naira(o.total)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Describe the problem">
          <Textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={4000} rows={5} />
        </Field>
      </form>
    </Modal>
  );
}
