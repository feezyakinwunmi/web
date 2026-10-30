// Cash orders are paid to the rider, so Vesphe transfers the vendor's share
// (orders.vendor_payout) by bank transfer. Admins record each transfer with a
// reference and receipt. See supabase/migrations/20261104000000_vendor_cash_payouts.sql.
import { supabase } from './supabase';

const BUCKET = 'payout-receipts';

export interface CashOwed {
  vendor_id: string;
  vendor_name: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  owed: number;
  order_count: number;
  oldest_order_at: string | null;
}

export interface UnpaidCashOrder {
  id: string;
  order_number: string | null;
  vendor_payout: number;
  total: number;
  delivered_at: string | null;
  created_at: string;
}

export interface CashPayout {
  id: string;
  vendor_id: string;
  vendor_name?: string;
  amount: number;
  order_count: number;
  reference: string | null;
  receipt_path: string | null;
  receipt_url: string | null;
  note: string | null;
  paid_at: string;
}

export async function fetchCashOwed(): Promise<CashOwed[]> {
  const { data, error } = await supabase.rpc('admin_cash_owed');
  if (error) throw error;
  return ((data as CashOwed[]) || []).map(r => ({ ...r, owed: Number(r.owed) || 0, order_count: Number(r.order_count) || 0 }));
}

export async function fetchUnpaidCashOrders(vendorId: string): Promise<UnpaidCashOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_number, vendor_payout, total, delivered_at, created_at')
    .eq('vendor_id', vendorId)
    .eq('payment_method', 'cash')
    .eq('status', 'delivered')
    .is('cash_payout_id', null)
    .order('delivered_at', { ascending: true });
  if (error) throw error;
  return ((data as UnpaidCashOrder[]) || []).map(o => ({ ...o, vendor_payout: Number(o.vendor_payout) || 0, total: Number(o.total) || 0 }));
}

export async function recordCashPayout(vendorId: string, reference: string, receipt: File, note?: string) {
  const ext = receipt.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${vendorId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, receipt, { contentType: receipt.type || undefined });
  if (uploadError) throw uploadError;
  const { error } = await supabase.rpc('admin_record_cash_payout', {
    p_vendor_id: vendorId,
    p_reference: reference.trim(),
    p_receipt_path: path,
    p_note: note?.trim() || null,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
}

// Admin: all payouts. Vendor: row-level security limits this to their own.
export async function fetchCashPayouts(vendorId?: string): Promise<CashPayout[]> {
  let query = supabase.from('vendor_cash_payouts').select('*, vendor:vendor_id (name)').order('paid_at', { ascending: false }).limit(200);
  if (vendorId) query = query.eq('vendor_id', vendorId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as (CashPayout & { vendor?: { name: string } | null })[]) || [];
  const paths = rows.map(r => r.receipt_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    (urls || []).forEach(u => u.path && u.signedUrl && signed.set(u.path, u.signedUrl));
  }
  return rows.map(r => ({
    ...r,
    vendor_name: r.vendor?.name,
    amount: Number(r.amount) || 0,
    receipt_url: r.receipt_path ? signed.get(r.receipt_path) || null : null,
  }));
}
