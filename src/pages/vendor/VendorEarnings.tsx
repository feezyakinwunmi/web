import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard, Table, Tabs, Td, Th } from '../../components/ui';
import { daysAgo, dateTime, naira } from '../../lib/format';
import { orderLabel } from '../../lib/orders';
import { useVendorOrders } from './VendorOrders';
import { VendorCashPayouts } from './VendorCashPayouts';

type Range = '7' | '30' | 'all';

export function VendorEarnings() {
  const { vendor } = useAuth();
  const { orders, loading } = useVendorOrders(vendor?.id);
  const [range, setRange] = useState<Range>('30');

  // Earning orders: delivered, plus paid card orders (Paystack settles the vendor's
  // share when the customer pays). No wallet: money goes straight to the bank.
  const earning = useMemo(() => {
    const from = range === 'all' ? 0 : daysAgo(Number(range)).getTime();
    return orders.filter(o =>
      o.status !== 'cancelled' &&
      (o.status === 'delivered' || (o.payment_method === 'card' && o.payment_status === 'paid')) &&
      new Date(o.created_at).getTime() >= from
    );
  }, [orders, range]);

  const totals = useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    let card = 0, settling = 0, cash = 0;
    for (const o of earning) {
      const share = Number(o.vendor_payout) || 0;
      if (o.payment_method === 'card') {
        if (new Date(o.created_at).getTime() > dayAgo) settling += share;
        else card += share;
      } else cash += share;
    }
    return { card, settling, cash, total: card + settling + cash };
  }, [earning]);

  if (!vendor) return <EmptyState title="No store found" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Earnings"
        subtitle="Card payments are paid straight to your bank by Paystack, usually the next business day."
        actions={
          <Tabs<Range>
            value={range}
            onChange={setRange}
            options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: 'all', label: 'All time' }]}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total earned" value={naira(totals.total)} tone="brand" icon={<Wallet className="size-4" />} hint={`${earning.length} orders`} />
        <StatCard label="Sent to your bank" value={naira(totals.card)} tone="ok" hint="Card payments" />
        <StatCard label="Arriving soon" value={naira(totals.settling)} tone="warn" hint="Card payments from the last 24h" />
        <StatCard label="Cash orders" value={naira(totals.cash)} hint="Sent by Vesphe after delivery" />
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <Landmark className="size-5 text-ink-3" />
        {vendor.paystack_subaccount_code ? (
          <span className="text-ink-2">
            Payouts go to <span className="font-medium text-ink">{vendor.account_name}</span> ·{' '}
            {(vendor.bank_name || '').toUpperCase()} ••••{(vendor.account_number || '').slice(-4)}
          </span>
        ) : (
          <span className="text-warn">
            No payout account yet — customers can't pay you by card.{' '}
            <Link to="/vendor/settings" className="font-medium text-brand hover:underline">Add your bank account</Link>
          </span>
        )}
      </Card>

      <VendorCashPayouts vendorId={vendor.id} />

      <Card>
        <div className="border-b border-line px-5 py-4 font-semibold">Earning orders</div>
        {loading ? (
          <Spinner />
        ) : earning.length === 0 ? (
          <EmptyState title="No earnings in this period" />
        ) : (
          <Table
            head={
              <tr>
                <Th>Order</Th>
                <Th>Date</Th>
                <Th>Order total</Th>
                <Th>Your share</Th>
                <Th>Paid by</Th>
              </tr>
            }
          >
            {earning.map(o => (
              <tr key={o.id}>
                <Td className="font-medium">{orderLabel(o)}</Td>
                <Td className="text-ink-2">{dateTime(o.created_at)}</Td>
                <Td>{naira(o.total)}</Td>
                <Td className="font-medium text-ok">{naira(o.vendor_payout)}</Td>
                <Td>
                  <Badge tone={o.payment_method === 'card' ? 'info' : 'neutral'}>
                    {o.payment_method === 'card' ? 'card → bank' : 'cash'}
                  </Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
