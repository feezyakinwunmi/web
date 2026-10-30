import { useEffect, useState } from 'react';
import { FileText, Send } from 'lucide-react';
import { Card, Spinner, Table, Td, Th } from '../../components/ui';
import { dateTime, naira } from '../../lib/format';
import { type CashPayout, fetchCashPayouts, fetchUnpaidCashOrders } from '../../lib/cashPayouts';

// Shown on the vendor Earnings page: cash still to be transferred, and every
// transfer Vesphe has made with its receipt.
export function VendorCashPayouts({ vendorId }: { vendorId: string }) {
  const [payouts, setPayouts] = useState<CashPayout[] | null>(null);
  const [pending, setPending] = useState({ amount: 0, count: 0 });

  useEffect(() => {
    fetchCashPayouts(vendorId).then(setPayouts).catch(() => setPayouts([]));
    fetchUnpaidCashOrders(vendorId)
      .then(orders => setPending({ amount: orders.reduce((s, o) => s + o.vendor_payout, 0), count: orders.length }))
      .catch(() => {});
  }, [vendorId]);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <div>
          <div className="font-semibold">Cash order payouts</div>
          <div className="text-xs text-ink-3">Riders collect cash orders; Vesphe then sends your share by bank transfer.</div>
        </div>
        <div className="text-right text-sm">
          <div className="text-ink-3">On its way</div>
          <div className="font-semibold text-warn">{naira(pending.amount)} · {pending.count} order{pending.count === 1 ? '' : 's'}</div>
        </div>
      </div>
      {payouts === null ? (
        <Spinner />
      ) : payouts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-ink-3">
          <Send className="size-6" />
          No cash payouts yet. They'll appear here with the bank receipt.
        </div>
      ) : (
        <Table head={<tr><Th>Paid</Th><Th>Reference</Th><Th>Orders</Th><Th>Amount</Th><Th>Receipt</Th></tr>}>
          {payouts.map(p => (
            <tr key={p.id}>
              <Td className="text-ink-2">
                {dateTime(p.paid_at)}
                {p.note && <div className="text-xs italic text-ink-3">{p.note}</div>}
              </Td>
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
  );
}
