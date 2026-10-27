export const naira = (value: number | string | null | undefined) =>
  `₦${Math.round(Number(value) || 0).toLocaleString('en-NG')}`;

export const dateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '—';

export const dateOnly = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const timeAgo = (value: string | null | undefined) => {
  if (!value) return '—';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return dateOnly(value);
};

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const daysAgo = (days: number) => {
  const d = startOfToday();
  d.setDate(d.getDate() - days);
  return d;
};

export const titleCase = (value: string | null | undefined) =>
  (value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
