// Company fleet: Vesphe's motorcycles and which rider has each one.
// See supabase/migrations/20261105000000_company_bikes.sql.
import { supabase } from './supabase';

const BUCKET = 'fleet-documents';

export type BikeStatus = 'available' | 'assigned' | 'maintenance' | 'retired';

export interface Bike {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  engine_number: string | null;
  chassis_number: string | null;
  photo_path: string | null;
  papers_path: string | null;
  status: BikeStatus;
  notes: string | null;
  created_at: string;
  // joined / derived
  photo_url?: string | null;
  papers_url?: string | null;
  rider?: { id: string; name: string | null; phone: string | null } | null;
  assigned_at?: string | null;
}

export interface Assignment {
  id: string;
  bike_id: string;
  rider_id: string;
  assigned_at: string;
  returned_at: string | null;
  rider?: { name: string | null } | null;
  bike?: { plate_number: string } | null;
}

export const bikeLabel = (b: Pick<Bike, 'color' | 'make' | 'model' | 'plate_number'>) =>
  [b.color, b.make, b.model].filter(Boolean).join(' ') || 'Motorcycle';

export async function fetchBikes(): Promise<Bike[]> {
  const [{ data: bikes, error }, { data: current }] = await Promise.all([
    supabase.from('company_bikes').select('*').order('created_at', { ascending: false }),
    supabase.from('bike_assignments').select('bike_id, assigned_at, rider:rider_id (id, name, phone)').is('returned_at', null),
  ]);
  if (error) throw error;
  const byBike = new Map((current || []).map((a: any) => [a.bike_id, a]));

  const rows = (bikes as Bike[]) || [];
  const paths = rows.flatMap(b => [b.photo_path, b.papers_path]).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    (data || []).forEach(d => d.path && d.signedUrl && signed.set(d.path, d.signedUrl));
  }
  return rows.map(b => ({
    ...b,
    photo_url: b.photo_path ? signed.get(b.photo_path) || null : null,
    papers_url: b.papers_path ? signed.get(b.papers_path) || null : null,
    rider: (byBike.get(b.id) as any)?.rider || null,
    assigned_at: (byBike.get(b.id) as any)?.assigned_at || null,
  }));
}

export async function fetchBikeHistory(bikeId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('bike_assignments')
    .select('*, rider:rider_id (name)')
    .eq('bike_id', bikeId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  return (data as Assignment[]) || [];
}

// The bike a rider currently has (or null).
export async function fetchRiderBike(riderId: string): Promise<(Bike & { assigned_at: string }) | null> {
  const { data } = await supabase
    .from('bike_assignments')
    .select('assigned_at, bike:bike_id (*)')
    .eq('rider_id', riderId)
    .is('returned_at', null)
    .maybeSingle();
  const bike = (data as any)?.bike as Bike | undefined;
  return bike ? { ...bike, assigned_at: (data as any).assigned_at } : null;
}

async function upload(bikeId: string, file: File, kind: 'photo' | 'papers') {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${bikeId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: true });
  if (error) throw error;
  return path;
}

export type BikeInput = Pick<Bike, 'plate_number' | 'make' | 'model' | 'year' | 'color' | 'engine_number' | 'chassis_number' | 'notes'>;

export async function saveBike(input: BikeInput, opts: { id?: string; photo?: File | null; papers?: File | null }) {
  const row = { ...input, plate_number: input.plate_number.trim().toUpperCase(), updated_at: new Date().toISOString() };
  let id = opts.id;
  if (id) {
    const { error } = await supabase.from('company_bikes').update(row).eq('id', id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('company_bikes').insert(row).select('id').single();
    if (error) throw error.code === '23505' ? new Error('A bike with this plate number is already registered.') : error;
    id = data.id as string;
  }
  const files: Record<string, string> = {};
  if (opts.photo) files.photo_path = await upload(id!, opts.photo, 'photo');
  if (opts.papers) files.papers_path = await upload(id!, opts.papers, 'papers');
  if (Object.keys(files).length) {
    const { error } = await supabase.from('company_bikes').update(files).eq('id', id);
    if (error) throw error;
  }
  return id!;
}

export async function setBikeStatus(bikeId: string, status: 'available' | 'maintenance' | 'retired') {
  const { error } = await supabase.from('company_bikes').update({ status, updated_at: new Date().toISOString() }).eq('id', bikeId);
  if (error) throw error;
}

export async function assignBike(bikeId: string, riderId: string, notes?: string) {
  const { error } = await supabase.rpc('admin_assign_bike', { p_bike_id: bikeId, p_rider_id: riderId, p_notes: notes || null });
  if (error) throw error;
}

export async function returnBike(bikeId: string, newStatus: 'available' | 'maintenance' | 'retired' = 'available') {
  const { error } = await supabase.rpc('admin_return_bike', { p_bike_id: bikeId, p_new_status: newStatus });
  if (error) throw error;
}

// Approved riders who don't have a bike right now.
export async function fetchRidersWithoutBike(): Promise<{ id: string; name: string | null; phone: string | null }[]> {
  const [{ data: riders }, { data: current }] = await Promise.all([
    supabase.from('users').select('id, name, phone').eq('role', 'rider').eq('is_suspended', false).order('name'),
    supabase.from('bike_assignments').select('rider_id').is('returned_at', null),
  ]);
  const busy = new Set((current || []).map((a: any) => a.rider_id));
  return (riders || []).filter(r => !busy.has(r.id));
}

// ---------------------------------------------------------------------------
// Bike expenses (fuel, repairs, servicing, parts) — admin only
// ---------------------------------------------------------------------------

export type ExpenseKind = 'fuel' | 'repair' | 'service' | 'parts' | 'other';

export const EXPENSE_KINDS: { value: ExpenseKind; label: string }[] = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'repair', label: 'Repair' },
  { value: 'service', label: 'Servicing' },
  { value: 'parts', label: 'Parts' },
  { value: 'other', label: 'Other' },
];

export interface BikeExpense {
  id: string;
  bike_id: string;
  kind: ExpenseKind;
  amount: number;
  litres: number | null;
  odometer_km: number | null;
  note: string | null;
  spent_at: string;
  created_at: string;
  bike?: { plate_number: string } | null;
  recorder?: { name: string | null } | null;
}

export async function fetchExpenses(opts: { bikeId?: string; from?: string } = {}): Promise<BikeExpense[]> {
  let query = supabase
    .from('bike_expenses')
    .select('*, bike:bike_id (plate_number), recorder:recorded_by (name)')
    .order('spent_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);
  if (opts.bikeId) query = query.eq('bike_id', opts.bikeId);
  if (opts.from) query = query.gte('spent_at', opts.from);
  const { data, error } = await query;
  if (error) throw error;
  return ((data as BikeExpense[]) || []).map(e => ({ ...e, amount: Number(e.amount) || 0 }));
}

export type ExpenseInput = Pick<BikeExpense, 'bike_id' | 'kind' | 'amount' | 'litres' | 'odometer_km' | 'note' | 'spent_at'>;

export async function addExpense(input: ExpenseInput) {
  const { error } = await supabase.from('bike_expenses').insert(input);
  if (error) throw error;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from('bike_expenses').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Delivery bags
// ---------------------------------------------------------------------------

export type BagStatus = 'available' | 'assigned' | 'damaged' | 'lost' | 'retired';

export interface Bag {
  id: string;
  bag_code: string;
  size: string | null;
  color: string | null;
  status: BagStatus;
  notes: string | null;
  created_at: string;
  rider?: { id: string; name: string | null; phone: string | null } | null;
  assigned_at?: string | null;
}

export async function fetchBags(): Promise<Bag[]> {
  const [{ data: bags, error }, { data: current }] = await Promise.all([
    supabase.from('delivery_bags').select('*').order('bag_code'),
    supabase.from('bag_assignments').select('bag_id, assigned_at, rider:rider_id (id, name, phone)').is('returned_at', null),
  ]);
  if (error) throw error;
  const byBag = new Map((current || []).map((a: any) => [a.bag_id, a]));
  return ((bags as Bag[]) || []).map(b => ({
    ...b,
    rider: (byBag.get(b.id) as any)?.rider || null,
    assigned_at: (byBag.get(b.id) as any)?.assigned_at || null,
  }));
}

export async function saveBag(input: Pick<Bag, 'bag_code' | 'size' | 'color' | 'notes'>, id?: string) {
  const row = { ...input, bag_code: input.bag_code.trim().toUpperCase(), updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from('delivery_bags').update(row).eq('id', id)
    : await supabase.from('delivery_bags').insert(row);
  if (error) throw error.code === '23505' ? new Error('A bag with this code already exists.') : error;
}

export async function setBagStatus(id: string, status: 'available' | 'damaged' | 'lost' | 'retired') {
  const { error } = await supabase.from('delivery_bags').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function assignBag(bagId: string, riderId: string) {
  const { error } = await supabase.rpc('admin_assign_bag', { p_bag_id: bagId, p_rider_id: riderId });
  if (error) throw error;
}

export async function returnBag(bagId: string, newStatus: 'available' | 'damaged' | 'lost' | 'retired' = 'available') {
  const { error } = await supabase.rpc('admin_return_bag', { p_bag_id: bagId, p_new_status: newStatus });
  if (error) throw error;
}

export async function fetchRiderBag(riderId: string): Promise<(Bag & { assigned_at: string }) | null> {
  const { data } = await supabase
    .from('bag_assignments')
    .select('assigned_at, bag:bag_id (*)')
    .eq('rider_id', riderId)
    .is('returned_at', null)
    .maybeSingle();
  const bag = (data as any)?.bag as Bag | undefined;
  return bag ? { ...bag, assigned_at: (data as any).assigned_at } : null;
}

// Approved riders who don't have a bag right now.
export async function fetchRidersWithoutBag(): Promise<{ id: string; name: string | null; phone: string | null }[]> {
  const [{ data: riders }, { data: current }] = await Promise.all([
    supabase.from('users').select('id, name, phone').eq('role', 'rider').eq('is_suspended', false).order('name'),
    supabase.from('bag_assignments').select('rider_id').is('returned_at', null),
  ]);
  const busy = new Set((current || []).map((a: any) => a.rider_id));
  return (riders || []).filter(r => !busy.has(r.id));
}
