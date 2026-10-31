import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, Search } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, Select, Spinner, Table, Tabs, Td, Textarea, Th } from '../../components/ui';
import { dateTime, timeAgo } from '../../lib/format';
import { type Bag, type BagStatus, assignBag, fetchBags, fetchRidersWithoutBag, returnBag, saveBag, setBagStatus } from '../../lib/fleet';

type Filter = BagStatus | 'all';

export const BAG_STATUS: Record<BagStatus, { label: string; tone: 'ok' | 'info' | 'warn' | 'bad' | 'neutral' }> = {
  available: { label: 'Available', tone: 'ok' },
  assigned: { label: 'With rider', tone: 'info' },
  damaged: { label: 'Damaged', tone: 'warn' },
  lost: { label: 'Lost', tone: 'bad' },
  retired: { label: 'Retired', tone: 'neutral' },
};

// Fleet → Delivery bags: each bag has a code and is assigned to one rider at a time.
export function FleetBags() {
  const { toast } = useFeedback();
  const [bags, setBags] = useState<Bag[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Bag | 'new' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBags(await fetchBags());
    } catch (e) {
      toast((e as Error).message, 'error');
      setBags([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const list = bags || [];
  const count = (s: BagStatus) => list.filter(b => b.status === s).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter(b => filter === 'all' || b.status === filter)
      .filter(b => !q || b.bag_code.toLowerCase().includes(q) || (b.rider?.name || '').toLowerCase().includes(q));
  }, [list, filter, query]);
  const selected = list.find(b => b.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: list.length },
            { value: 'available', label: 'Available', count: count('available') },
            { value: 'assigned', label: 'With rider', count: count('assigned') },
            { value: 'damaged', label: 'Damaged', count: count('damaged') },
            { value: 'lost', label: 'Lost', count: count('lost') },
          ]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input placeholder="Bag code or rider" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
          </div>
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add bag</Button>
        </div>
      </div>

      <Card>
        {bags === null ? (
          <Spinner label="Loading bags…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Package className="size-8" />} title={list.length ? 'No bags match' : 'No delivery bags yet'} text={list.length ? undefined : 'Give each bag a code (e.g. BAG-001), write it on the bag, then assign it to a rider.'} />
        ) : (
          <Table head={<tr><Th>Bag</Th><Th>Rider</Th><Th>Status</Th></tr>}>
            {visible.map(b => (
              <tr key={b.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelectedId(b.id)}>
                <Td>
                  <div className="font-semibold tracking-wide">{b.bag_code}</div>
                  <div className="text-xs text-ink-3">{[b.color, b.size].filter(Boolean).join(' · ') || '—'}</div>
                </Td>
                <Td>
                  {b.rider ? (
                    <>
                      <div>{b.rider.name}</div>
                      <div className="text-xs text-ink-3">since {timeAgo(b.assigned_at)}</div>
                    </>
                  ) : <span className="text-ink-3">—</span>}
                </Td>
                <Td><Badge tone={BAG_STATUS[b.status].tone}>{BAG_STATUS[b.status].label}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && (
        <BagForm
          bag={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {selected && !editing && (
        <BagDrawer key={selected.id} bag={selected} onClose={() => setSelectedId(null)} onEdit={() => setEditing(selected)} onChanged={load} />
      )}
    </div>
  );
}

function BagForm({ bag, onClose, onSaved }: { bag: Bag | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [code, setCode] = useState(bag?.bag_code || '');
  const [size, setSize] = useState(bag?.size || '');
  const [color, setColor] = useState(bag?.color || '');
  const [notes, setNotes] = useState(bag?.notes || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!code.trim()) return toast('Add the bag code', 'error');
    setBusy(true);
    try {
      await saveBag({ bag_code: code, size: size || null, color: color || null, notes: notes || null }, bag?.id);
      toast(bag ? 'Bag updated' : 'Bag added');
      onSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={bag ? `Edit ${bag.bag_code}` : 'Add a delivery bag'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>{bag ? 'Save changes' : 'Add bag'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Bag code" hint="Write the same code on the bag so it can be identified">
          <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. BAG-001" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size (optional)">
            <Select value={size} onChange={e => setSize(e.target.value)}>
              <option value="">—</option>
              <option value="Small">Small</option>
              <option value="Medium">Medium</option>
              <option value="Large">Large</option>
            </Select>
          </Field>
          <Field label="Colour (optional)"><Input value={color} onChange={e => setColor(e.target.value)} placeholder="e.g. Orange" /></Field>
        </div>
        <Field label="Notes (optional)">
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

function BagDrawer({ bag, onClose, onEdit, onChanged }: { bag: Bag; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const { toast, confirm } = useFeedback();
  const [riders, setRiders] = useState<{ id: string; name: string | null; phone: string | null }[]>([]);
  const [riderId, setRiderId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (bag.status === 'available') fetchRidersWithoutBag().then(setRiders).catch(() => {});
  }, [bag.status]);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      onChanged();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const takeBack = async (status: 'available' | 'damaged' | 'lost') => {
    const label = status === 'available' ? 'returned' : status;
    const ok = await confirm({ title: `Mark ${bag.bag_code} as ${label}?`, message: `It will be taken off ${bag.rider?.name || 'the rider'}.`, confirmLabel: 'Confirm', danger: status === 'lost' });
    if (ok) run(() => returnBag(bag.id, status), `Bag marked as ${label}`);
  };

  return (
    <Drawer open onClose={onClose} title={`Bag ${bag.bag_code}`} footer={<Button variant="secondary" onClick={onEdit}>Edit details</Button>}>
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={BAG_STATUS[bag.status].tone}>{BAG_STATUS[bag.status].label}</Badge>
          <span className="text-ink-3">{[bag.color, bag.size].filter(Boolean).join(' · ')}</span>
        </div>
        {bag.notes && <p className="text-ink-2">{bag.notes}</p>}

        <section className="space-y-3 rounded-lg border border-line p-4">
          <h3 className="font-semibold">Rider</h3>
          {bag.status === 'assigned' && bag.rider ? (
            <>
              <div>
                <div className="font-medium">{bag.rider.name}</div>
                <div className="text-ink-3">{bag.rider.phone} · since {dateTime(bag.assigned_at)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => takeBack('available')}>Bag returned</Button>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => takeBack('damaged')}>Returned damaged</Button>
                <Button variant="danger" size="sm" disabled={busy} onClick={() => takeBack('lost')}>Lost</Button>
              </div>
            </>
          ) : bag.status === 'available' ? (
            riders.length === 0 ? (
              <p className="text-ink-3">Every approved rider already has a bag.</p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Field label="Assign to">
                    <Select value={riderId} onChange={e => setRiderId(e.target.value)}>
                      <option value="">Choose a rider…</option>
                      {riders.map(r => <option key={r.id} value={r.id}>{r.name || 'Rider'}{r.phone ? ` · ${r.phone}` : ''}</option>)}
                    </Select>
                  </Field>
                </div>
                <Button disabled={!riderId || busy} onClick={() => run(() => assignBag(bag.id, riderId), 'Bag assigned. The rider has been notified.')}>Assign bag</Button>
              </div>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-3">This bag is {BAG_STATUS[bag.status].label.toLowerCase()}.</span>
              <Button size="sm" disabled={busy} onClick={() => run(() => setBagStatus(bag.id, 'available'), 'Bag is available again')}>Mark as available</Button>
              {bag.status !== 'retired' && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => setBagStatus(bag.id, 'retired'), 'Bag retired')}>Retire</Button>
              )}
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
