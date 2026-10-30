import { useCallback, useEffect, useState } from 'react';
import { Copy, FileText, Send } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Spinner, Table, Tabs, Td, Textarea, Th } from '../../components/ui';
import { dateTime, naira, timeAgo } from '../../lib/format';
import { BANKS } from '../../lib/banks';
import {
  type CashOwed,
  type CashPayout,
  type UnpaidCashOrder,
  fetchCashOwed,
  fetchCashPayouts,
  fetchUnpaidCashOrders,
  recordCashPayout,
} from '../../lib/cashPayouts';

type Tab = 'owed' | 'paid';

const bankLabel = (v: string | null) => BANKS.find(b => b.value === v || b.label === v)?.label || v || '—';

export function AdminCashPayouts() {
  const { toast } = useFeedback();
  const [tab, setTab] = useState<Tab>('owed');
  const [owed, setOwed] = useState<CashOwed[]>([]);
  const [paid, setPaid] = useState<CashPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CashOwed | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([fetchCashOwed(), fetchCashPayouts()]);
      setOwed(o);
      setPaid(p);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const totalOwed = owed.reduce((s, v) => s + v.owed, 0);

  return (
    <div>
      <PageHeader
        title="Cash payouts"
        subtitle={`Riders collect cash orders, so vendors get their share by transfer. ${naira(totalOwed)} owed to ${owed.length} vendor${owed.length === 1 ? '' : 's'}.`}
      />

      <div className="mb-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'owed', label: 'To pay', count: owed.length },
            { value: 'paid', label: 'Paid', count: paid.length },
          ]}
        />
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading…" />
        ) : tab === 'owed' ? (
          owed.length === 0 ? (
            <EmptyState icon={<Send className="size-8" />} title="All cash orders are paid out" />
          ) : (
            <Table head={<tr><Th>Vendor</Th><Th>Bank account</Th><Th>Orders</Th><Th>Oldest</Th><Th>Owed</Th></tr>}>
              {owed.map(v => (
                <tr key={v.vendor_id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(v)}>
                  <Td className="font-medium">{v.vendor_name}</Td>
                  <Td className="text-ink-2">{v.account_number ? `${bankLabel(v.bank_name)} · ${v.account_number}` : <span className="text-warn">Not added</span>}</Td>
                  <Td>{v.order_count}</Td>
                  <Td className="text-ink-3">{timeAgo(v.oldest_order_at)}</Td>
                  <Td className="font-semibold">{naira(v.owed)}</Td>
                </tr>
              ))}
            </Table>
          )
        ) : paid.length === 0 ? (
          <EmptyState icon={<Send className="size-8" />} title="No payouts recorded yet" />
        ) : (
          <Table head={<tr><Th>Vendor</Th><Th>Paid</Th><Th>Reference</Th><Th>Orders</Th><Th>Amount</Th><Th>Receipt</Th></tr>}>
            {paid.map(p => (
              <tr key={p.id}>
                <Td className="font-medium">{p.vendor_name || '—'}</Td>
                <Td className="text-ink-2">{dateTime(p.paid_at)}</Td>
                <Td>{p.reference}</Td>
                <Td>{p.order_count}</Td>
                <Td className="font-semibold text-ok">{naira(p.amount)}</Td>
                <Td>
                  {p.receipt_url ? (
                    <a href={p.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                      <FileText className="size-4" /> View
                    </a>
                  ) : '—'}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {selected && (
        <PayoutDrawer
          key={selected.vendor_id}
          vendor={selected}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PayoutDrawer({ vendor, onClose, onDone }: { vendor: CashOwed; onClose: () => void; onDone: () => void }) {
  const { toast, confirm } = useFeedback();
  const [orders, setOrders] = useState<UnpaidCashOrder[] | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchUnpaidCashOrders(vendor.vendor_id).then(setOrders).catch(e => toast((e as Error).message, 'error'));
  }, [vendor.vendor_id, toast]);

  const total = (orders || []).reduce((s, o) => s + o.vendor_payout, 0);

  const save = async () => {
    if (!reference.trim()) return toast('Add the transfer reference', 'error');
    if (!receipt) return toast('Attach the transfer receipt', 'error');
    const ok = await confirm({ title: `Mark ${naira(total)} as paid?`, message: `${vendor.vendor_name} will be notified with the receipt.`, confirmLabel: 'Mark as paid' });
    if (!ok) return;
    setBusy(true);
    try {
      await recordCashPayout(vendor.vendor_id, reference, receipt, note);
      toast('Payout recorded');
      onDone();
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
      title={vendor.vendor_name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !orders?.length} onClick={save}>Mark {naira(total)} as paid</Button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="rounded-lg border border-brand/30 bg-brand/10 p-4">
          <div className="text-ink-3">Amount to send</div>
          <div className="mt-1 text-3xl font-bold">{naira(total)}</div>
          <div className="text-ink-3">Vendor's share of {orders?.length ?? '…'} delivered cash order(s)</div>
        </div>

        <section>
          <h3 className="mb-2 font-semibold">Send to</h3>
          <div className="rounded-lg border border-line p-4">
            {vendor.account_number ? (
              <>
                <div className="font-medium">{vendor.account_name || vendor.vendor_name}</div>
                <div className="text-ink-3">{bankLabel(vendor.bank_name)}</div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(vendor.account_number || '');
                    toast('Account number copied');
                  }}
                  className="mt-2 inline-flex items-center gap-2 rounded-md bg-surface-2 px-3 py-1.5 text-lg font-semibold tracking-wider hover:bg-surface-3"
                >
                  {vendor.account_number} <Copy className="size-4 text-brand" />
                </button>
              </>
            ) : (
              <span className="text-warn">This vendor hasn't added a bank account yet.</span>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">Orders included</h3>
          {orders === null ? (
            <Spinner />
          ) : (
            <div className="overflow-hidden rounded-lg border border-line">
              <Table head={<tr><Th>Order</Th><Th>Delivered</Th><Th>Customer paid</Th><Th>Vendor share</Th></tr>}>
                {orders.map(o => (
                  <tr key={o.id}>
                    <Td className="font-medium">#{o.order_number || o.id.slice(0, 8)}</Td>
                    <Td className="text-ink-2">{dateTime(o.delivered_at || o.created_at)}</Td>
                    <Td>{naira(o.total)}</Td>
                    <Td className="font-medium">{naira(o.vendor_payout)}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="font-semibold">After you've made the transfer</h3>
          <Field label="Transfer reference">
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="From your bank app" />
          </Field>
          <Field label="Receipt" hint="Screenshot, photo or PDF of the transfer">
            <input type="file" accept="image/*,application/pdf" onChange={e => setReceipt(e.target.files?.[0] || null)} className="block w-full text-sm" />
          </Field>
          {receipt && <Badge tone="ok">{receipt.name}</Badge>}
          <Field label="Note (optional)">
            <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Visible to the vendor" />
          </Field>
        </section>
      </div>
    </Drawer>
  );
}
