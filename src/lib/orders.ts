import { invokeFunction, supabase } from './supabase';
import type { Order, OrderStatus } from './types';

export const ORDER_SELECT =
  '*, customer:customer_id(name, phone, email), vendor:vendor_id(name)';

export const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'scheduled', 'confirmed', 'preparing', 'ready'];
export const COMPLETED_STATUSES: OrderStatus[] = ['picked_up', 'in_transit', 'delivered'];

// What a vendor can do next from each status (riders handle pickup onwards).
export const VENDOR_NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  pending: { status: 'confirmed', label: 'Accept order' },
  scheduled: { status: 'confirmed', label: 'Accept order' },
  confirmed: { status: 'preparing', label: 'Start preparing' },
  preparing: { status: 'ready', label: 'Mark ready for pickup' },
};

export const canCancel = (order: Order) => ['pending', 'scheduled', 'confirmed', 'preparing'].includes(order.status);

export const isPaidCard = (order: Order) => order.payment_method === 'card' && order.payment_status === 'paid';

export async function setOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (error) throw error;
}

// Paid card orders are cancelled and refunded by the process-refund function;
// cash/unpaid orders are simply cancelled.
export async function cancelOrder(order: Order, reason: string, by: 'vendor' | 'admin') {
  if (isPaidCard(order)) {
    const result = await invokeFunction<{ success: boolean; error?: string }>('process-refund', {
      order_id: order.id,
      reason,
    });
    if (!result?.success) throw new Error(result?.error || 'Refund failed');
    return 'refunded' as const;
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelled', cancelled_by: by, cancelled_at: now, updated_at: now, rejection_reason: reason })
    .eq('id', order.id);
  if (error) throw error;
  return 'cancelled' as const;
}

// Vendor's share: stored at checkout; fallback for older orders without it.
export const vendorShare = (order: Order, feePct = 10) =>
  Number(order.vendor_payout) || Math.max(0, (order.subtotal || 0) - Math.round((order.subtotal || 0) * (feePct / 100)));

export const orderLabel = (order: Order) => `#${order.order_number || order.id.slice(0, 8)}`;
