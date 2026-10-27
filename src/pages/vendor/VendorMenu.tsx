import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, UtensilsCrossed, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner, Table, Tabs, Td, Th, Toggle } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { naira } from '../../lib/format';
import type { Product } from '../../lib/types';
import { MenuEditor } from './MenuEditor';

type Filter = 'all' | 'approved' | 'pending' | 'rejected';

const STATUS_TONE = { approved: 'ok', pending: 'warn', rejected: 'bad' } as const;

export function VendorMenu() {
  const { vendor } = useAuth();
  const { toast, confirm } = useFeedback();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(async () => {
    if (!vendor) return;
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });
    if (error) toast(error.message, 'error');
    setProducts((data as Product[]) || []);
    setLoading(false);
  }, [vendor, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter(p => filter === 'all' || (p.approval_status || 'pending') === filter)
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, filter, query]);

  const count = (s: Filter) => (s === 'all' ? products.length : products.filter(p => (p.approval_status || 'pending') === s).length);

  const setAvailable = async (product: Product, value: boolean) => {
    setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_available: value } : p)));
    const { error } = await supabase.from('products').update({ is_available: value }).eq('id', product.id);
    if (error) {
      toast(error.message, 'error');
      load();
    }
  };

  const remove = async (product: Product) => {
    const ok = await confirm({
      title: `Delete ${product.name}?`,
      message: 'Customers will no longer see this dish. Past orders are not affected.',
      confirmLabel: 'Delete dish',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) return toast(error.message, 'error');
    toast('Dish deleted');
    load();
  };

  if (!vendor) return <EmptyState title="No store found" text="Finish setting up your store in the Vesphe app." />;

  return (
    <div>
      <PageHeader
        title="Menu"
        subtitle="New dishes and changes to dish details are reviewed by an admin before customers see them."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => { setEditing(null); setEditorOpen(true); }}>
            Add dish
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: count('all') },
            { value: 'approved', label: 'Live', count: count('approved') },
            { value: 'pending', label: 'In review', count: count('pending') },
            { value: 'rejected', label: 'Rejected', count: count('rejected') },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Search dishes" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading menu…" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<UtensilsCrossed className="size-8" />}
            title={products.length ? 'No dishes match' : 'Your menu is empty'}
            text={products.length ? undefined : 'Add your first dish. Auto-fill can write the ingredients for you.'}
          />
        ) : (
          <Table
            head={
              <tr>
                <Th>Dish</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th>Ingredients</Th>
                <Th>Available</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            }
          >
            {visible.map(p => {
              const status = p.approval_status || 'pending';
              return (
                <tr key={p.id} className="hover:bg-surface-2">
                  <Td>
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="size-11 rounded-lg object-cover" />
                      ) : (
                        <div className="size-11 rounded-lg bg-surface-3" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-ink-3">{p.category}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-medium">{naira(p.price)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[status]}>{status === 'approved' ? 'live' : status === 'pending' ? 'in review' : 'rejected'}</Badge>
                    {status === 'rejected' && p.rejection_reason && (
                      <div className="mt-1 max-w-48 text-xs text-bad">{p.rejection_reason}</div>
                    )}
                  </Td>
                  <Td>
                    {p.ingredients?.length ? (
                      <span className="text-ink-2">{p.ingredients.length} listed</span>
                    ) : (
                      <span className="text-warn">Missing</span>
                    )}
                  </Td>
                  <Td>
                    <Toggle checked={p.is_available ?? true} onChange={v => setAvailable(p, v)} />
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => { setEditing(p); setEditorOpen(true); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => remove(p)} aria-label={`Delete ${p.name}`} />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <MenuEditor open={editorOpen} product={editing} vendorId={vendor.id} onClose={() => setEditorOpen(false)} onSaved={load} />
    </div>
  );
}
