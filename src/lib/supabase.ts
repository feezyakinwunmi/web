import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = !!url && !!anonKey;

// Same project and security rules as the mobile app. Only the public anon key is used
// here; every privileged action is enforced by RLS, database guards or edge functions.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Extracts the server's error message from a failed edge function call.
export async function functionError(error: unknown, fallback: string): Promise<string> {
  try {
    const body = await (error as { context?: Response })?.context?.json?.();
    if (body?.message) return body.message;
  } catch {
    // body was not JSON
  }
  return (error as Error)?.message || fallback;
}

export async function invokeFunction<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await functionError(error, 'Request failed'));
  if (data && data.status === false) throw new Error(data.message || 'Request failed');
  return data as T;
}

// Loads every row of a query, 1000 at a time (Supabase's per-request cap), so
// admin lists show the full history instead of the newest page only.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const size = 1000;
  const rows: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return { data: rows, error: null };
}
