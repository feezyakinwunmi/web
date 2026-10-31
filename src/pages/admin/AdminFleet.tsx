import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike as BikeIcon, FileText, Plus, Search } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, StatCard, Table, Tabs, Td, Textarea, Th } from '../../components/ui';
import { dateOnly, dateTime, timeAgo } from '../../lib/format';
import {
  type Assignment,
  type Bike,
  type BikeInput,
  type BikeStatus,
  assignBike,
  bikeLabel,
  fetchBikeHistory,
  fetchBikes,
  fetchRidersWithoutBike,
  returnBike,
  saveBike,
  setBikeStatus,
} from '../../lib/fleet';

type Filter = BikeStatus | 'all';

export const BIKE_STATUS: Record<BikeStatus, { label: string; tone: 'ok' | 'info' | 'warn' | 'neutral' }> = {
  available: { label: 'Available', tone: 'ok' },
  assigned: { label: 'With rider', tone: 'info' },
  maintenance: { label: 'In repair', tone: 'warn' },
  retired: { label: 'Retired', tone: 'neutral' },
};

export function AdminFleet() {
  const { toast } = useFeedback();
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Bike | 'new' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBikes(await fetchBikes());
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const count = (s: BikeStatus) => bikes.filter(b => b.status === s).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bikes
      .filter(b => filter === 'all' || b.status === filter)
      .filter(b => !q || b.plate_number.toLowerCase().includes(q) || bikeLabel(b).toLowerCase().includes(q) || (b.rider?.name || '').toLowerCase().includes(q));
  }, [bikes, filter, query]);

  const selected = bikes.find(b => b.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet"
        subtitle="Vesphe's motorcycles. Register each bike once, then assign it to a rider."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Add bike</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bikes" value={bikes.length.toString()} tone="brand" icon={<BikeIcon className="size-4" />} />
        <StatCard label="Available" value={count('available').toString()} tone="ok" hint="Ready to assign" />
        <StatCard label="With riders" value={count('assigned').toString()} />
        <StatCard label="In repair" value={count('maintenance').toString()} tone="warn" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: bikes.length },
            { value: 'available', label: 'Available', count: count('available') },
            { value: 'assigned', label: 'With rider', count: count('assigned') },
            { value: 'maintenance', label: 'In repair', count: count('maintenance') },
            { value: 'retired', label: 'Retired', count: count('retired') },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Plate, model or rider" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading fleet…" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<BikeIcon className="size-8" />}
            title={bikes.length ? 'No bikes match' : 'No bikes registered yet'}
            text={bikes.length ? undefined : 'Add each motorcycle Vesphe owns, then assign them to approved riders.'}
          />
        ) : (
          <Table head={<tr><Th>Bike</Th><Th>Plate</Th><Th>Rider</Th><Th>Status</Th></tr>}>
            {visible.map(b => (
              <tr key={b.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelectedId(b.id)}>
                <Td>
                  <div className="flex items-center gap-3">
                    {b.photo_url ? <img src={b.photo_url} alt="" className="size-10 rounded-lg object-cover" /> : <div className="flex size-10 items-center justify-center rounded-lg bg-surface-3"><BikeIcon className="size-4 text-ink-3" /></div>}
                    <div>
                      <div className="font-medium">{bikeLabel(b)}</div>
                      <div className="text-xs text-ink-3">{b.year || '—'}</div>
                    </div>
                  </div>
                </Td>
                <Td className="font-semibold tracking-wide">{b.plate_number}</Td>
                <Td>
                  {b.rider ? (
                    <>
                      <div>{b.rider.name}</div>
                      <div className="text-xs text-ink-3">since {timeAgo(b.assigned_at)}</div>
                    </>
                  ) : <span className="text-ink-3">—</span>}
                </Td>
                <Td><Badge tone={BIKE_STATUS[b.status].tone}>{BIKE_STATUS[b.status].label}</Badge></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {editing && (
        <BikeForm
          bike={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {selected && !editing && (
        <BikeDrawer
          key={selected.id}
          bike={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditing(selected)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function BikeForm({ bike, onClose, onSaved }: { bike: Bike | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [form, setForm] = useState<BikeInput>({
    plate_number: bike?.plate_number || '',
    make: bike?.make || '',
    model: bike?.model || '',
    year: bike?.year || null,
    color: bike?.color || '',
    engine_number: bike?.engine_number || '',
    chassis_number: bike?.chassis_number || '',
    notes: bike?.notes || '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [papers, setPapers] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof BikeInput>(k: K, v: BikeInput[K]) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.plate_number.trim()) return toast('Add the plate number', 'error');
    setBusy(true);
    try {
      await saveBike(
        { ...form, make: form.make || null, model: form.model || null, color: form.color || null, engine_number: form.engine_number || null, chassis_number: form.chassis_number || null, notes: form.notes || null },
        { id: bike?.id, photo, papers },
      );
      toast(bike ? 'Bike updated' : 'Bike added');
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
      title={bike ? `Edit ${bike.plate_number}` : 'Add a bike'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>{bike ? 'Save changes' : 'Add bike'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Plate number">
          <Input value={form.plate_number} onChange={e => set('plate_number', e.target.value.toUpperCase())} placeholder="e.g. LSR 123 AB" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Make"><Input value={form.make || ''} onChange={e => set('make', e.target.value)} placeholder="e.g. Bajaj" /></Field>
          <Field label="Model"><Input value={form.model || ''} onChange={e => set('model', e.target.value)} placeholder="e.g. Boxer" /></Field>
          <Field label="Year"><Input inputMode="numeric" value={form.year ?? ''} onChange={e => set('year', parseInt(e.target.value.replace(/\D/g, '').slice(0, 4), 10) || null)} placeholder="2024" /></Field>
          <Field label="Colour"><Input value={form.color || ''} onChange={e => set('color', e.target.value)} placeholder="e.g. Red" /></Field>
          <Field label="Engine number"><Input value={form.engine_number || ''} onChange={e => set('engine_number', e.target.value)} /></Field>
          <Field label="Chassis number"><Input value={form.chassis_number || ''} onChange={e => set('chassis_number', e.target.value)} /></Field>
        </div>
        <Field label="Photo" hint={bike?.photo_url ? 'Choose a file to replace the current photo' : 'Side view with the plate visible'}>
          <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] || null)} className="block w-full text-sm" />
        </Field>
        <Field label="Papers" hint="Vehicle licence, registration or receipt (image or PDF)">
          <input type="file" accept="image/*,application/pdf" onChange={e => setPapers(e.target.files?.[0] || null)} className="block w-full text-sm" />
        </Field>
        <Field label="Notes (optional)">
          <Textarea rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

function BikeDrawer({ bike, onClose, onEdit, onChanged }: { bike: Bike; onClose: () => void; onEdit: () => void; onChanged: () => void }) {
  const { toast, confirm } = useFeedback();
  const [history, setHistory] = useState<Assignment[] | null>(null);
  const [riders, setRiders] = useState<{ id: string; name: string | null; phone: string | null }[]>([]);
  const [riderId, setRiderId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchBikeHistory(bike.id).then(setHistory).catch(() => setHistory([]));
    if (bike.status === 'available') fetchRidersWithoutBike().then(setRiders).catch(() => {});
  }, [bike.id, bike.status]);

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

  const takeBack = async (status: 'available' | 'maintenance') => {
    const ok = await confirm({
      title: `Take ${bike.plate_number} back from ${bike.rider?.name}?`,
      message: status === 'maintenance' ? 'The bike will be marked as in repair.' : 'The bike will be available to assign again.',
      confirmLabel: 'Take back',
    });
    if (ok) run(() => returnBike(bike.id, status), 'Bike returned');
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${bike.plate_number} · ${bikeLabel(bike)}`}
      footer={<Button variant="secondary" onClick={onEdit}>Edit details</Button>}
    >
      <div className="space-y-6 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={BIKE_STATUS[bike.status].tone}>{BIKE_STATUS[bike.status].label}</Badge>
          <span className="text-ink-3">Registered {dateOnly(bike.created_at)}</span>
        </div>

        {bike.photo_url && <img src={bike.photo_url} alt="" className="max-h-60 w-full rounded-lg object-cover" />}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-line p-4">
          {[
            ['Make / model', [bike.make, bike.model].filter(Boolean).join(' ')],
            ['Year', bike.year ? String(bike.year) : ''],
            ['Colour', bike.color],
            ['Engine no.', bike.engine_number],
            ['Chassis no.', bike.chassis_number],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs text-ink-3">{k}</dt>
              <dd>{v || '—'}</dd>
            </div>
          ))}
          {bike.papers_url && (
            <div className="col-span-2">
              <a href={bike.papers_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand hover:underline">
                <FileText className="size-4" /> View papers
              </a>
            </div>
          )}
        </dl>
        {bike.notes && <p className="text-ink-2">{bike.notes}</p>}

        <section className="space-y-3 rounded-lg border border-line p-4">
          <h3 className="font-semibold">Rider</h3>
          {bike.status === 'assigned' && bike.rider ? (
            <>
              <div>
                <div className="font-medium">{bike.rider.name}</div>
                <div className="text-ink-3">{bike.rider.phone} · since {dateTime(bike.assigned_at)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => takeBack('available')}>Take bike back</Button>
                <Button variant="secondary" disabled={busy} onClick={() => takeBack('maintenance')}>Take back for repair</Button>
              </div>
            </>
          ) : bike.status === 'available' ? (
            <>
              {riders.length === 0 ? (
                <p className="text-ink-3">Every approved rider already has a bike.</p>
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
                  <Button disabled={!riderId || busy} onClick={() => run(() => assignBike(bike.id, riderId), 'Bike assigned. The rider has been notified.')}>Assign bike</Button>
                </div>
              )}
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => setBikeStatus(bike.id, 'maintenance'), 'Marked as in repair')}>Mark as in repair</Button>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className="text-ink-3">{bike.status === 'maintenance' ? 'This bike is in repair.' : 'This bike is retired.'}</span>
              <Button size="sm" disabled={busy} onClick={() => run(() => setBikeStatus(bike.id, 'available'), 'Bike is available again')}>Mark as available</Button>
              {bike.status === 'maintenance' && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => setBikeStatus(bike.id, 'retired'), 'Bike retired')}>Retire bike</Button>
              )}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 font-semibold">History</h3>
          {history === null ? (
            <Spinner />
          ) : history.length === 0 ? (
            <p className="text-ink-3">Not assigned to anyone yet.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <Table head={<tr><Th>Rider</Th><Th>From</Th><Th>Until</Th></tr>}>
                {history.map(h => (
                  <tr key={h.id}>
                    <Td>{h.rider?.name || '—'}</Td>
                    <Td className="text-ink-2">{dateTime(h.assigned_at)}</Td>
                    <Td className="text-ink-2">{h.returned_at ? dateTime(h.returned_at) : <Badge tone="info">current</Badge>}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
