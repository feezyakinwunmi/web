import type { ReactNode } from 'react';
import { MapPin, Phone, User, MessageSquare, CreditCard, Banknote, Clock } from 'lucide-react';
import { Badge, Drawer, OrderStatusBadge } from './ui';
import { dateTime, naira, titleCase } from '../lib/format';
import { orderLabel } from '../lib/orders';
import type { Order } from '../lib/types';

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${strong ? 'font-semibold text-ink' : 'text-ink-2'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function OrderDrawer({
  order,
  onClose,
  actions,
  showVendor,
  showPlatform,
}: {
  order: Order | null;
  onClose: () => void;
  actions?: ReactNode;
  showVendor?: boolean;
  showPlatform?: boolean;
}) {
  if (!order) return null;
  const address = order.delivery_address;
  const customerName = order.customer?.name || order.customer_name || 'Customer';
  const customerPhone = order.customer?.phone || order.customer_phone || address?.phone;

  return (
    <Drawer
      open={!!order}
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          {orderLabel(order)} <OrderStatusBadge status={order.status} />
        </span>
      }
      footer={actions}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <Clock className="size-4" /> {dateTime(order.created_at)}
          {order.is_scheduled && order.scheduled_datetime && (
            <Badge tone="info">Scheduled for {dateTime(order.scheduled_datetime)}</Badge>
          )}
          {showVendor && order.vendor?.name && <Badge tone="neutral">{order.vendor.name}</Badge>}
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Items</h3>
          <div className="divide-y divide-line rounded-lg border border-line">
            {(order.items || []).map((item, i) => (
              <div key={i} className="flex justify-between px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-brand">{item.quantity}×</span> {item.name}
                </span>
                <span className="text-ink-2">{naira(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
        </section>

        {(order.special_request_text || order.notes) && (
          <section className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm">
            <div className="mb-1 flex items-center gap-2 font-medium text-warn">
              <MessageSquare className="size-4" />
              {order.special_request_category ? titleCase(order.special_request_category) : 'Customer note'}
            </div>
            <p className="text-ink">{order.special_request_text || order.notes}</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Payment</h3>
          <div className="rounded-lg border border-line p-4">
            <Row label="Subtotal" value={naira(order.subtotal)} />
            <Row label="Delivery" value={naira(order.delivery_fee)} />
            {!!order.discount && <Row label="Discount" value={`−${naira(order.discount)}`} />}
            <Row label="Total" value={naira(order.total)} strong />
            <div className="my-2 border-t border-line" />
            <Row label="Vendor share" value={naira(order.vendor_payout)} strong={!showPlatform} />
            {showPlatform && <Row label="Platform commission" value={naira(order.platform_commission)} />}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {order.payment_method === 'card' ? <CreditCard className="size-4 text-ink-3" /> : <Banknote className="size-4 text-ink-3" />}
              <span className="capitalize">{order.payment_method}</span>
              <Badge tone={order.payment_status === 'paid' ? 'ok' : order.payment_status === 'refunded' ? 'info' : 'warn'}>
                {order.payment_status || 'pending'}
              </Badge>
              {order.refund_status && <Badge tone="info">refund {order.refund_status}</Badge>}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">Customer</h3>
          <div className="space-y-2 rounded-lg border border-line p-4 text-sm">
            <div className="flex items-center gap-2"><User className="size-4 text-ink-3" />{customerName}</div>
            {customerPhone && (
              <a href={`tel:${customerPhone}`} className="flex items-center gap-2 text-brand hover:underline">
                <Phone className="size-4" />{customerPhone}
              </a>
            )}
            {address && (
              <div className="flex items-start gap-2 text-ink-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />
                <span>
                  {[address.street, address.area].filter(Boolean).join(', ')}
                  {address.landmark && <span className="block text-xs text-ink-3">Landmark: {address.landmark}</span>}
                </span>
              </div>
            )}
          </div>
        </section>

        {order.rejection_reason && order.status === 'cancelled' && (
          <section className="rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
            Cancelled: {order.rejection_reason}
          </section>
        )}
      </div>
    </Drawer>
  );
}
