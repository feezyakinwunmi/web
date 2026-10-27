// Date ranges for admin lists and reports. "all" means no limit: full history.
export type PeriodPreset = 'all' | 'today' | '7' | '30' | 'month' | 'last_month' | 'year' | 'custom';

export interface Period {
  preset: PeriodPreset;
  from?: string; // yyyy-mm-dd, custom only
  to?: string; // yyyy-mm-dd inclusive, custom only
}

export const ALL_TIME: Period = { preset: 'all' };

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  all: 'All time',
  today: 'Today',
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  month: 'This month',
  last_month: 'Last month',
  year: 'This year',
  custom: 'Custom range',
};

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Returns ISO bounds [from, to) or null for an open end.
export function periodBounds(p: Period): { from: string | null; to: string | null } {
  const now = new Date();
  const today = startOfDay(now);
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  switch (p.preset) {
    case 'all':
      return { from: null, to: null };
    case 'today':
      return { from: iso(today), to: null };
    case '7':
    case '30': {
      const d = new Date(today);
      d.setDate(d.getDate() - (Number(p.preset) - 1));
      return { from: iso(d), to: null };
    }
    case 'month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: null };
    case 'last_month':
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
      };
    case 'year':
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: null };
    case 'custom': {
      const from = p.from ? startOfDay(new Date(`${p.from}T00:00:00`)) : null;
      let to: Date | null = null;
      if (p.to) {
        to = startOfDay(new Date(`${p.to}T00:00:00`));
        to.setDate(to.getDate() + 1);
      }
      return { from: iso(from), to: iso(to) };
    }
  }
}

export function periodLabel(p: Period) {
  if (p.preset !== 'custom') return PERIOD_LABELS[p.preset];
  return `${p.from || 'start'} → ${p.to || 'today'}`;
}

// Applies the period to a Supabase query on the given timestamp column.
export function applyPeriod<Q extends { gte: (c: string, v: string) => Q; lt: (c: string, v: string) => Q }>(
  query: Q,
  p: Period,
  column = 'created_at'
): Q {
  const { from, to } = periodBounds(p);
  let q = query;
  if (from) q = q.gte(column, from);
  if (to) q = q.lt(column, to);
  return q;
}
