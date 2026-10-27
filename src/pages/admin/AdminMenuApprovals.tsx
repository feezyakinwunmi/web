import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Spinner, Table, Tabs, Td, Textarea, Th } from '../../components/ui';
import { fetchAll, supabase } from '../../lib/supabase';
import { dateOnly, naira, titleCase } from '../../lib/format';
import { reviewFood } from '../../lib/foodSafety';
import type { Product } from '../../lib/types';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

export function AdminMenuApprovals() {
  const { profile } = useAuth();
  const { toast, confirm } = useFeedback();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchAll<Product>((from, to) =>
      supabase
        .from('products')
        .select('*, vendor:vendor_id(name)')
        .order('created_at', { ascending: false })
        .range(from, to)
    );
    if (error) toast(error.message, 'error');
    setProducts((data as Product[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const count = (f: Filter) => (f === 'all' ? products.length : products.filter(p => (p.approval_status || 'pending') === f).length);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter(p => filter === 'all' || (p.approval_status || 'pending') === filter)
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.vendor?.name || '').toLowerCase().includes(q));
  }, [products, filter, query]);

  const decide = async (product: Product, decision: 'approved' | 'rejected', reason?: string) => {
    setBusy(true);
    const { error } = await supabase
      .from('products')
      .update({
        approval_status: decision,
        rejection_reason: decision === 'rejected' ? reason : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: profile?.id,
      })
      .eq('id', product.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast(decision === 'approved' ? `${product.name} is now live` : `${product.name} rejected — the vendor will see your reason`);
    setSelected(null);
    load();
  };

  const approve = async (product: Product) => {
    const { issues } = reviewFood(product);
    if (issues.length) {
      const ok = await confirm({
        title: 'Ingredient check found issues',
        message: (
          <div>
            <ul className="mb-3 list-disc space-y-1 pl-5">{issues.map(i => <li key={i}>{i}</li>)}</ul>
            Approve anyway? Rejecting asks the vendor to fix the listing.
          </div>
        ),
        confirmLabel: 'Approve anyway',
        danger: true,
      });
      if (!ok) {
        setRejectReason(issues.join('; '));
        return;
      }
    }
    decide(product, 'approved');
  };

  const reject = (product: Product) => {
    if (!rejectReason.trim()) return toast('Write a reason so the vendor knows what to fix', 'error');
    decide(product, 'rejected', rejectReason.trim());
  };

  return (
    <div>
      <PageHeader title="Menu approvals" subtitle="Check ingredients and allergens before dishes go live." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: 'To review', count: count('pending') },
            { value: 'approved', label: 'Live', count: count('approved') },
            { value: 'rejected', label: 'Rejected', count: count('rejected') },
            { value: 'all', label: 'All', count: count('all') },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Dish or vendor" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading dishes…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="size-8" />} title={filter === 'pending' ? 'All caught up' : 'No dishes here'} />
        ) : (
          <Table
            head={
              <tr>
                <Th>Dish</Th>
                <Th>Vendor</Th>
                <Th>Price</Th>
                <Th>Ingredient check</Th>
                <Th>Submitted</Th>
              </tr>
            }
          >
            {visible.map(p => {
              const { issues } = reviewFood(p);
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => { setSelected(p); setRejectReason(''); }}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {p.image_url ? <img src={p.image_url} alt="" className="size-11 rounded-lg object-cover" /> : <div className="size-11 rounded-lg bg-surface-3" />}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-ink-3">{p.category}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>{p.vendor?.name || '—'}</Td>
                  <Td>{naira(p.price)}</Td>
                  <Td>
                    {issues.length ? <Badge tone="warn"><AlertTriangle className="size-3" />{issues.length} to check</Badge> : <Badge tone="ok"><CheckCircle2 className="size-3" />OK</Badge>}
                  </Td>
                  <Td className="text-ink-2">{dateOnly(p.created_at)}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {selected && (
        <ReviewDrawer
          product={selected}
          busy={busy}
          rejectReason={rejectReason}
          setRejectReason={setRejectReason}
          onClose={() => setSelected(null)}
          onApprove={() => approve(selected)}
          onReject={() => reject(selected)}
        />
      )}
    </div>
  );
}

function ReviewDrawer({ product, busy, rejectReason, setRejectReason, onClose, onApprove, onReject }: {
  product: Product;
  busy: boolean;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const review = reviewFood(product);
  const status = product.approval_status || 'pending';

  return (
    <Drawer
      open
      onClose={onClose}
      title={product.name}
      footer={
        <>
          {status !== 'rejected' && <Button variant="danger" disabled={busy} onClick={onReject}>Reject</Button>}
          {status !== 'approved' && <Button disabled={busy} onClick={onApprove}>Approve</Button>}
        </>
      }
    >
      <div className="space-y-5 text-sm">
        {product.image_url && <img src={product.image_url} alt="" className="h-48 w-full rounded-xl object-cover" />}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-brand">{naira(product.price)}</span>
          <Badge>{product.category}</Badge>
          <Badge>{product.vendor?.name}</Badge>
          {product.preparation_time && <Badge>{product.preparation_time}</Badge>}
        </div>
        <p className="text-ink-2">{product.description || <span className="text-bad">No description</span>}</p>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Ingredients</h3>
          {product.ingredients?.length ? (
            <div className="flex flex-wrap gap-1.5">{product.ingredients.map((i, n) => <Badge key={i + n}>{i}</Badge>)}</div>
          ) : (
            <span className="text-bad">No ingredients listed</span>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Allergens</h3>
          {review.allAllergens.length ? (
            <div className="flex flex-wrap gap-1.5">{review.allAllergens.map(a => <Badge key={a.id} tone="warn">{a.icon} {a.label}</Badge>)}</div>
          ) : (
            <span className="text-ink-3">None declared or detected</span>
          )}
        </section>

        {!!product.health_tags?.length && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Health tags</h3>
            <div className="flex flex-wrap gap-1.5">{product.health_tags.map(t => <Badge key={t}>{titleCase(t)}</Badge>)}</div>
          </section>
        )}

        <section className={`rounded-lg border p-4 ${review.issues.length ? 'border-warn/30 bg-warn/10' : 'border-ok/30 bg-ok/10'}`}>
          <div className={`mb-1 flex items-center gap-2 font-semibold ${review.issues.length ? 'text-warn' : 'text-ok'}`}>
            {review.issues.length ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
            Ingredient check: {review.issues.length ? 'needs attention' : 'no issues found'}
          </div>
          {review.issues.map(i => <div key={i} className="text-ink">• {i}</div>)}
        </section>

        {status !== 'rejected' && (
          <Field label="Reason (shown to the vendor if you reject)">
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="e.g. Please list the ingredients and mark crayfish as shellfish" />
          </Field>
        )}
        {status === 'rejected' && product.rejection_reason && (
          <div className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-bad">Rejected: {product.rejection_reason}</div>
        )}
      </div>
    </Drawer>
  );
}
