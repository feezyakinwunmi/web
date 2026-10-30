import { useEffect, useState } from 'react';
import { BadgePercent, Gift, Image as ImageIcon, Megaphone, Smartphone } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Badge, Card, PageHeader, Spinner } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { dateOnly, naira } from '../../lib/format';

// Promotions are created and paid for in the Vesphe app (Paystack checkout runs
// there), so this page explains the steps and shows the vendor's existing promotions.

interface Promotion {
  id: string;
  title: string;
  promotion_type: string;
  status: string;
  days_count: number;
  start_date: string | null;
  end_date: string | null;
  rejection_reason: string | null;
  views: number | null;
  clicks: number | null;
  created_at: string;
}

const STATUS: Record<string, { label: string; tone: 'warn' | 'ok' | 'bad' | 'neutral' | 'info' }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'neutral' },
  pending_approval: { label: 'In review', tone: 'warn' },
  active: { label: 'Live', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  expired: { label: 'Ended', tone: 'neutral' },
};

const TYPES = [
  { icon: ImageIcon, title: 'Flyer', text: 'A banner image for your shop, like a new dish, opening hours or a holiday special.' },
  { icon: BadgePercent, title: 'Product offer', text: 'One item at a discounted price, with an optional limit per customer.' },
  { icon: Gift, title: 'Combo', text: '"Buy X, get Y free". Pick the main item, the free item and the quantities.' },
];

const STEPS = [
  'Open the Vesphe app on your phone and sign in with this vendor account.',
  'On your Home screen, tap Promote in the shortcuts row. This opens My Promotions.',
  'Tap Create Promotion.',
  'Choose a type: Flyer, Product offer or Combo.',
  'Add a title, an optional description and a banner image (16:9, landscape, works best).',
  'For a product offer or combo, pick the menu items and set the price or quantities. Only approved menu items can be promoted.',
  'Enter how many days it should run. The total cost is shown before you pay.',
  'Tap Proceed to Payment and pay with your card through Paystack.',
  'Our team reviews it (usually within a few hours). Once approved, it goes live on the customer home page.',
];

export function VendorPromote() {
  const { vendor } = useAuth();
  const [costPerDay, setCostPerDay] = useState<number | null>(null);
  const [promos, setPromos] = useState<Promotion[] | null>(null);

  useEffect(() => {
    supabase
      .from('platform_settings')
      .select('promotion_cost_per_day')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCostPerDay(Number(data?.promotion_cost_per_day) || 300));
  }, []);

  useEffect(() => {
    if (!vendor) return;
    supabase
      .from('promotions')
      .select('id, title, promotion_type, status, days_count, start_date, end_date, rejection_reason, views, clicks, created_at')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setPromos((data as Promotion[]) || []));
  }, [vendor]);

  return (
    <div className="space-y-6">
      <PageHeader title="Promote your shop" subtitle="Get featured on the Vesphe home page and reach more customers." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-brand/15 text-brand">
              <Smartphone className="size-5" />
            </div>
            <div>
              <h2 className="font-semibold">How to create a promotion</h2>
              <p className="text-sm text-ink-3">Promotions are created and paid for in the Vesphe mobile app.</p>
            </div>
          </div>
          <ol className="space-y-3">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{i + 1}</span>
                <span className="pt-0.5 text-ink-2">{step}</span>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-sm text-ink-3">Price</div>
            <div className="mt-1 text-3xl font-bold">{costPerDay === null ? '…' : naira(costPerDay)}</div>
            <div className="text-sm text-ink-3">per day</div>
            {costPerDay !== null && (
              <div className="mt-4 space-y-1 border-t border-line pt-4 text-sm">
                {[3, 7, 14].map(d => (
                  <div key={d} className="flex justify-between">
                    <span className="text-ink-2">{d} days</span>
                    <span className="font-medium">{naira(costPerDay * d)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="p-5 text-sm text-ink-2">
            <h3 className="mb-2 font-semibold text-ink">Tips for approval</h3>
            <ul className="list-disc space-y-1 pl-4">
              <li>Use a bright, clear photo of your real food.</li>
              <li>Keep text on the image short and readable.</li>
              <li>Make sure the offer price is lower than the normal price.</li>
              <li>If a promotion is rejected, you'll see the reason in the app and can create a new one.</li>
            </ul>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Promotion types</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {TYPES.map(t => (
            <Card key={t.title} className="p-5">
              <t.icon className="mb-3 size-5 text-brand" />
              <div className="font-medium">{t.title}</div>
              <p className="mt-1 text-sm text-ink-3">{t.text}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Your promotions</h2>
        <Card>
          {promos === null ? (
            <Spinner label="Loading promotions…" />
          ) : promos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-ink-3">
              <Megaphone className="size-7" />
              You haven't run a promotion yet. Follow the steps above to create your first one in the app.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {promos.map(p => {
                const status = STATUS[p.status] || { label: p.status, tone: 'neutral' as const };
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-ink-3">
                        {p.promotion_type.replace(/_/g, ' ')} · {p.days_count} days
                        {p.start_date ? ` · ${dateOnly(p.start_date)} – ${dateOnly(p.end_date)}` : ` · created ${dateOnly(p.created_at)}`}
                        {p.status === 'active' || p.status === 'expired' ? ` · ${p.views || 0} views · ${p.clicks || 0} clicks` : ''}
                      </div>
                      {p.status === 'rejected' && p.rejection_reason && <div className="mt-1 text-xs text-bad">{p.rejection_reason}</div>}
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
