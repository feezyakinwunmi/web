export type Role = 'customer' | 'vendor' | 'admin' | 'rider' | 'business';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'scheduled';

export interface OrderItem {
  product_id?: string;
  name: string;
  quantity: number;
  price: number;
  options?: unknown[];
}

export interface Order {
  id: string;
  order_number: string | null;
  customer_id: string;
  vendor_id: string;
  rider_id: string | null;
  items: OrderItem[] | null;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  service_fee?: number | null;
  discount: number;
  total: number;
  vendor_payout: number | null;
  platform_commission: number | null;
  payment_method: 'cash' | 'card' | 'transfer';
  payment_status: string | null;
  payment_reference?: string | null;
  delivery_address: { street?: string; area?: string; label?: string; phone?: string; landmark?: string } | null;
  customer_name: string | null;
  customer_phone: string | null;
  special_request_text: string | null;
  special_request_category: string | null;
  notes: string | null;
  is_scheduled: boolean | null;
  scheduled_datetime: string | null;
  rejection_reason: string | null;
  refund_status: string | null;
  created_at: string;
  updated_at: string | null;
  vendor?: { name: string } | null;
  customer?: { name: string; phone: string | null; email: string | null } | null;
}

export interface Product {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category: string;
  is_available: boolean | null;
  is_popular: boolean | null;
  preparation_time: string | null;
  track_stock: boolean | null;
  stock_quantity: number | null;
  approval_status: 'pending' | 'approved' | 'rejected' | null;
  rejection_reason: string | null;
  ingredients: string[] | null;
  allergens: string[] | null;
  health_tags: string[] | null;
  meal_times: string[] | null;
  created_at: string;
  vendor?: { name: string } | null;
}

export interface Vendor {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  category: string;
  image_url: string | null;
  cover_image_url: string | null;
  address: string;
  phone: string;
  email: string | null;
  is_open: boolean | null;
  is_approved: boolean | null;
  is_suspended: boolean | null;
  delivery_time: string | null;
  min_order: number | null;
  bank_name: string | null;
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
  paystack_subaccount_code: string | null;
  rating: number | null;
  review_count: number | null;
  created_at: string;
}

export interface HealthTag {
  id: string;
  tag: string;
  label: string;
  category: string;
}
