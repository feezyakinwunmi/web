import { useCallback, useEffect, useMemo, useState } from 'react';
import { Fuel, Plus, Trash2, Wrench } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, Select, Spinner, StatCard, Table, Tabs, Td, Textarea, Th } from '../../components/ui';
import { dateOnly, naira } from '../../lib/format';
import { type Bike, type BikeExpense, type ExpenseKind, EXPENSE_KINDS, addExpense, deleteExpense, fetchBikes, fetchExpenses } from '../../lib/fleet';

type Range = '30' | '90' | 'all';

const kindLabel = (k: ExpenseKind) => EXPENSE_KINDS.find(x => x.value === k)?.label || k;
const KIND_TONE: Record<ExpenseKind, 'warn' | 'bad' | 'info' | 'neutral' | 'ok'> = {
  fuel: 'warn',
  repair: 'bad',
  service: 'info',
  parts: 'neutral',
  other: 'neutral',
};

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

// Fleet → Expenses: fuel, repairs, servicing and parts across all bikes.
export function FleetExpenses() {
  const { toast } = useFeedback();
  const [range, setRange] = useState<Range>('30');
  const [bikeId, setBikeId] = useState('');
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [rows, setRows] = useState<BikeExpense[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await fetchExpenses({ bikeId: bikeId || undefined, from: range === 'all' ? undefined : isoDaysAgo(Number(range)) }));
    } catch (e) {
      toast((e as Error).message, 'error');
      setRows([]);
    }
  }, [bikeId, range, toast]);

  useEffect(() => {
    fetchBikes().then(setBikes).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => {
    const list = rows || [];
    const sum = (f: (e: BikeExpense) => boolean) => list.filter(f).reduce((s, e) => s + e.amount, 0);
    return {
      all: sum(() => true),
      fuel: sum(e => e.kind === 'fuel'),
      upkeep: sum(e => e.kind !== 'fuel'),
      litres: list.reduce((s, e) => s + (Number(e.litres) || 0), 0),
    };
  }, [rows]);

  // Spend per bike for the period, highest first.
  const perBike = useMemo(() => {
    const map = new Map<string, { plate: string; total: number; fuel: number; count: number }>();
    (rows || []).forEach(e => {
      const k = e.bike_id;
      const cur = map.get(k) || { plate: e.bike?.plate_number || '—', total: 0, fuel: 0, count: 0 };
      cur.total += e.amount;
      if (e.kind === 'fuel') cur.fuel += e.amount;
      cur.count += 1;
      map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs<Range>
            value={range}
            onChange={setRange}
            options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }]}
          />
          <Select value={bikeId} onChange={e => setBikeId(e.target.value)} className="w-56">
            <option value="">All bikes</option>
            {bikes.map(b => <option key={b.id} value={b.id}>{b.plate_number}</option>)}
          </Select>
        </div>
        <Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)} disabled={!bikes.length}>Add expense</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total spent" value={naira(totals.all)} tone="brand" hint={`${rows?.length ?? 0} entries`} />
        <StatCard label="Fuel" value={naira(totals.fuel)} tone="warn" icon={<Fuel className="size-4" />} hint={totals.litres ? `${totals.litres.toLocaleString()} litres` : undefined} />
        <StatCard label="Repairs, servicing & parts" value={naira(totals.upkeep)} icon={<Wrench className="size-4" />} />
        <StatCard label="Avg per bike" value={naira(perBike.length ? totals.all / perBike.length : 0)} hint={`${perBike.length} bike${perBike.length === 1 ? '' : 's'}`} />
      </div>

      {perBike.length > 1 && !bikeId && (
        <Card>
          <div className="border-b border-line px-5 py-4 font-semibold">By bike</div>
          <Table head={<tr><Th>Bike</Th><Th>Entries</Th><Th>Fuel</Th><Th>Total</Th></tr>}>
            {perBike.map(b => (
              <tr key={b.plate}>
                <Td className="font-semibold tracking-wide">{b.plate}</Td>
                <Td>{b.count}</Td>
                <Td>{naira(b.fuel)}</Td>
                <Td className="font-semibold">{naira(b.total)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card>
        <div className="border-b border-line px-5 py-4 font-semibold">Entries</div>
        <ExpenseTable rows={rows} showBike={!bikeId} onDeleted={load} />
      </Card>

      {adding && (
        <ExpenseForm
          bikes={bikes}
          defaultBikeId={bikeId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

export function ExpenseTable({ rows, showBike, onDeleted }: { rows: BikeExpense[] | null; showBike?: boolean; onDeleted: () => void }) {
  const { toast, confirm } = useFeedback();
  if (rows === null) return <Spinner />;
  if (!rows.length) return <EmptyState icon={<Fuel className="size-8" />} title="No expenses recorded" />;

  const remove = async (e: BikeExpense) => {
    const ok = await confirm({ title: 'Delete this entry?', message: `${kindLabel(e.kind)} · ${naira(e.amount)} on ${dateOnly(e.spent_at)}`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await deleteExpense(e.id);
      toast('Entry deleted');
      onDeleted();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <Table
      head={
        <tr>
          <Th>Date</Th>
          {showBike && <Th>Bike</Th>}
          <Th>Type</Th>
          <Th>Details</Th>
          <Th>Amount</Th>
          <Th />
        </tr>
      }
    >
      {rows.map(e => (
        <tr key={e.id}>
          <Td className="text-ink-2">{dateOnly(e.spent_at)}</Td>
          {showBike && <Td className="font-medium tracking-wide">{e.bike?.plate_number || '—'}</Td>}
          <Td><Badge tone={KIND_TONE[e.kind]}>{kindLabel(e.kind)}</Badge></Td>
          <Td>
            <div className="text-ink-2">
              {[e.litres ? `${Number(e.litres)} L` : '', e.odometer_km ? `${e.odometer_km.toLocaleString()} km` : ''].filter(Boolean).join(' · ') || '—'}
            </div>
            {e.note && <div className="text-xs text-ink-3">{e.note}</div>}
            {e.recorder?.name && <div className="text-[11px] text-ink-3">by {e.recorder.name}</div>}
          </Td>
          <Td className="font-semibold">{naira(e.amount)}</Td>
          <Td>
            <button type="button" onClick={() => remove(e)} className="rounded p-1.5 text-ink-3 hover:bg-surface-2 hover:text-bad" aria-label="Delete">
              <Trash2 className="size-4" />
            </button>
          </Td>
        </tr>
      ))}
    </Table>
  );
}

export function ExpenseForm({ bikes, defaultBikeId, onClose, onSaved }: { bikes: Pick<Bike, 'id' | 'plate_number'>[]; defaultBikeId?: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useFeedback();
  const [bikeId, setBikeId] = useState(defaultBikeId || bikes[0]?.id || '');
  const [kind, setKind] = useState<ExpenseKind>('fuel');
  const [amount, setAmount] = useState('');
  const [litres, setLitres] = useState('');
  const [odometer, setOdometer] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const value = parseFloat(amount.replace(/,/g, ''));
    if (!bikeId) return toast('Choose a bike', 'error');
    if (!value || value <= 0) return toast('Enter the amount spent', 'error');
    setBusy(true);
    try {
      await addExpense({
        bike_id: bikeId,
        kind,
        amount: value,
        litres: kind === 'fuel' && litres ? parseFloat(litres) : null,
        odometer_km: odometer ? parseInt(odometer.replace(/\D/g, ''), 10) : null,
        note: note.trim() || null,
        spent_at: date,
      });
      toast('Expense recorded');
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
      title="Record an expense"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Bike">
          <Select value={bikeId} onChange={e => setBikeId(e.target.value)}>
            {bikes.map(b => <option key={b.id} value={b.id}>{b.plate_number}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {EXPENSE_KINDS.map(k => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${kind === k.value ? 'border-brand bg-brand/15 text-brand' : 'border-line hover:bg-surface-2'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (₦)"><Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          {kind === 'fuel' && (
            <Field label="Litres (optional)"><Input inputMode="decimal" value={litres} onChange={e => setLitres(e.target.value)} placeholder="e.g. 5" /></Field>
          )}
          <Field label="Odometer km (optional)"><Input inputMode="numeric" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="e.g. 12,450" /></Field>
        </div>
        <Field label="Note (optional)" hint="e.g. Filling station, mechanic name, what was fixed">
          <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}
