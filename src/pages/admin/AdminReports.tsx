import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, RefreshCw, Trophy } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { PeriodPicker } from '../../components/PeriodPicker';
import { Button, Card, PageHeader, Spinner, StatCard, Table, Td, Th } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { naira } from '../../lib/format';
import { ALL_TIME, periodBounds, periodLabel, type Period } from '../../lib/period';
import { downloadCsv } from '../../lib/csv';

type Num = number | string;
interface Report {
  orders: { placed: Num; delivered: Num; in_progress: Num; cancelled: Num; card: Num; cash: Num; customers: Num };
  sales: { gmv: Num; food: Num; delivery_fees: Num; service_fees: Num; discounts: Num; card_paid: Num; cash: Num };
  vendors: { payouts: Num; payouts_card: Num; payouts_cash: Num };
  riders: { order_earnings: Num; logistics_earnings: Num };
  refunds: { refunded_count: Num; refunded: Num; owed_count: Num; owed: Num };
  pro: { revenue: Num; payments: Num; monthly: Num; yearly: Num; active_now: Num };
  promotions: { revenue: Num; paid_count: Num; rejected_paid: Num };
  logistics: { requests: Num; paid: Num; platform_share: Num };
  platform: { commission: Num; delivery_share: Num; total: Num };
  signups: { customers: Num; vendors: Num; riders: Num; businesses: Num };
  totals_all_time: { customers: Num; vendors: Num; vendors_approved: Num; riders: Num; pro_users_ever: Num };
}

interface Month {
  month: string;
  orders: Num;
  delivered: Num;
  cancelled: Num;
  gmv: Num;
  commission: Num;
  service_fees: Num;
  delivery_fees: Num;
  vendor_payouts: Num;
  pro_revenue: Num;
  promotion_revenue: Num;
  logistics_share: Num;
  refunds: Num;
  new_customers: Num;
  new_vendors: Num;
  new_riders: Num;
  delivery_share: Num;
}

const n = (v: Num | null | undefined) => Number(v) || 0;

interface VoiceReport {
  turns: Num;
  users: Num;
  input_tokens: Num;
  output_tokens: Num;
  cost_usd: Num;
  cost_ngn: Num;
  usd_ngn_rate: Num;
  voice_orders: Num;
  pro_max_revenue: Num;
  pro_max_members_now: Num;
}
const count = (v: Num | null | undefined) => n(v).toLocaleString();
const monthLabel = (m: string) => new Date(`${m}T00:00:00`).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });

const ORDER_MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const GMV_MILESTONES = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000];
const USER_MILESTONES = [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000];

export function AdminReports() {
  const { toast } = useFeedback();
  const [period, setPeriod] = useState<Period>(ALL_TIME);
  const [report, setReport] = useState<Report | null>(null);
  const [allTime, setAllTime] = useState<Report | null>(null);
  const [months, setMonths] = useState<Month[]>([]);
  const [voice, setVoice] = useState<VoiceReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = periodBounds(period);
    const [r, m, all] = await Promise.all([
      supabase.rpc('admin_report', { p_from: from, p_to: to }),
      supabase.rpc('admin_report_monthly', { p_from: from, p_to: to }),
      period.preset === 'all' ? Promise.resolve(null) : supabase.rpc('admin_report', { p_from: null, p_to: null }),
    ]);
    const error = r.error || m.error || all?.error;
    if (error) toast(error.message, 'error');
    setReport((r.data as Report) || null);
    setAllTime(((all ? all.data : r.data) as Report) || null);
    setMonths((m.data as Month[]) || []);
    const v = await supabase.rpc('admin_voice_report', { p_from: from, p_to: to });
    setVoice((v.data as VoiceReport) || null);
    setLoading(false);
  }, [period, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const milestones = useMemo(() => {
    if (!allTime) return [];
    const next = (value: number, steps: number[]) => steps.find(s => s > value) ?? null;
    const reached = (value: number, steps: number[]) => [...steps].reverse().find(s => s <= value) ?? null;
    const delivered = n(allTime.orders.delivered);
    const gmv = n(allTime.sales.gmv);
    const customers = n(allTime.totals_all_time.customers);
    return [
      { label: 'Delivered orders', value: delivered, reached: reached(delivered, ORDER_MILESTONES), next: next(delivered, ORDER_MILESTONES), money: false },
      { label: 'Sales (GMV)', value: gmv, reached: reached(gmv, GMV_MILESTONES), next: next(gmv, GMV_MILESTONES), money: true },
      { label: 'Customers', value: customers, reached: reached(customers, USER_MILESTONES), next: next(customers, USER_MILESTONES), money: false },
    ];
  }, [allTime]);

  const exportMonths = () =>
    downloadCsv(`vesphe-monthly-${period.preset}.csv`, months.map(m => ({
      month: m.month,
      orders: n(m.orders),
      delivered: n(m.delivered),
      cancelled: n(m.cancelled),
      gmv: n(m.gmv),
      commission: n(m.commission),
      service_fees: n(m.service_fees),
      delivery_fees: n(m.delivery_fees),
      vendor_payouts: n(m.vendor_payouts),
      pro_revenue: n(m.pro_revenue),
      promotion_revenue: n(m.promotion_revenue),
      logistics_share: n(m.logistics_share),
      platform_revenue: n(m.commission) + n(m.service_fees) + n(m.delivery_share) + n(m.pro_revenue) + n(m.promotion_revenue) + n(m.logistics_share),
      refunds: n(m.refunds),
      new_customers: n(m.new_customers),
      new_vendors: n(m.new_vendors),
      new_riders: n(m.new_riders),
    })));

  const exportSummary = () => {
    if (!report) return;
    const rows: Record<string, unknown>[] = [];
    Object.entries(report).forEach(([section, values]) =>
      Object.entries(values as Record<string, Num>).forEach(([key, value]) => rows.push({ section, metric: key, value: n(value) }))
    );
    downloadCsv(`vesphe-summary-${period.preset}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle={`Full history of money and growth · ${periodLabel(period)}`}
        actions={
          <>
            <PeriodPicker value={period} onChange={setPeriod} />
            <Button variant="secondary" icon={<Download className="size-4" />} onClick={exportSummary} disabled={!report}>Summary CSV</Button>
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={load}>Refresh</Button>
          </>
        }
      />

      {loading || !report ? (
        <Spinner label="Crunching the numbers…" />
      ) : (
        <>
          {n(report.refunds.owed_count) > 0 && (
            <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
              <div>
                <div className="font-medium text-warn">{count(report.refunds.owed_count)} cancelled card orders still marked as paid ({naira(report.refunds.owed)})</div>
                <div className="mt-0.5 text-ink-2">
                  These customers paid but no refund is recorded. Check them in{' '}
                  <Link to="/admin/orders" className="text-brand hover:underline">Orders</Link> (filter: Cancelled) and refund or mark them.
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Vesphe revenue" value={naira(report.platform.total)} tone="brand" hint="Commission + service + delivery share + Pro + promotions + logistics" />
            <StatCard label="Sales (GMV)" value={naira(report.sales.gmv)} hint={`${count(report.orders.placed)} orders · ${count(report.orders.customers)} paying customers`} />
            <StatCard label="Paid to vendors" value={naira(report.vendors.payouts)} hint={`Card ${naira(report.vendors.payouts_card)} · cash ${naira(report.vendors.payouts_cash)}`} />
            <StatCard label="Rider earnings" value={naira(n(report.riders.order_earnings) + n(report.riders.logistics_earnings))} hint={`Food ${naira(report.riders.order_earnings)} · business ${naira(report.riders.logistics_earnings)}`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Breakdown title="Where Vesphe's revenue comes from">
              <Row label="Order commission" value={naira(report.platform.commission)} />
              <Row label="Service fees" value={naira(report.sales.service_fees)} />
              <Row label="Delivery fee share" value={naira(report.platform.delivery_share)} />
              <Row label={`Vesphe Pro (${count(report.pro.payments)} payments)`} value={naira(report.pro.revenue)} />
              <Row label={`Promotions (${count(report.promotions.paid_count)} paid)`} value={naira(report.promotions.revenue)} />
              <Row label="Business deliveries share" value={naira(report.logistics.platform_share)} />
              <Row label="Total" value={naira(report.platform.total)} strong />
            </Breakdown>

            <Breakdown title="Orders">
              <Row label="Placed" value={count(report.orders.placed)} />
              <Row label="Delivered" value={count(report.orders.delivered)} />
              <Row label="In progress" value={count(report.orders.in_progress)} />
              <Row label="Cancelled" value={count(report.orders.cancelled)} />
              <Row label="Paid by card" value={`${count(report.orders.card)} · ${naira(report.sales.card_paid)}`} />
              <Row label="Cash on delivery" value={`${count(report.orders.cash)} · ${naira(report.sales.cash)}`} />
              <Row label="Food value" value={naira(report.sales.food)} />
              <Row label="Delivery fees charged" value={naira(report.sales.delivery_fees)} />
              <Row label="Discounts given" value={naira(report.sales.discounts)} />
            </Breakdown>

            <Breakdown title="Refunds, Pro & growth">
              <Row label={`Refunded (${count(report.refunds.refunded_count)})`} value={naira(report.refunds.refunded)} />
              <Row label={`Refunds owed (${count(report.refunds.owed_count)})`} value={naira(report.refunds.owed)} warn={n(report.refunds.owed) > 0} />
              <Row label="Rejected promotions already paid" value={naira(report.promotions.rejected_paid)} warn={n(report.promotions.rejected_paid) > 0} />
              <Row label="Pro monthly / yearly" value={`${naira(report.pro.monthly)} / ${naira(report.pro.yearly)}`} />
              <Row label="Pro members now" value={count(report.pro.active_now)} />
              <Row label="New customers" value={count(report.signups.customers)} />
              <Row label="New vendors" value={count(report.signups.vendors)} />
              <Row label="New riders" value={count(report.signups.riders)} />
              <Row label="New businesses" value={count(report.signups.businesses)} />
            </Breakdown>
          </div>

          {voice && (
            <Card className="p-5">
              <h2 className="mb-1 font-semibold">Voice ordering (Pro Max)</h2>
              <p className="mb-4 text-xs text-ink-3">
                Claude AI cost estimated from tokens used, at the prices and dollar rate in Settings (₦{n(voice.usd_ngn_rate).toLocaleString()} per $1).
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Pro Max revenue" value={naira(voice.pro_max_revenue)} tone="brand" hint={`${count(voice.pro_max_members_now)} members now`} />
                <StatCard
                  label="Voice AI cost (est.)"
                  value={naira(voice.cost_ngn)}
                  tone={n(voice.cost_ngn) > n(voice.pro_max_revenue) ? 'bad' : 'default'}
                  hint={`${n(voice.cost_usd).toFixed(2)} · ${count(n(voice.input_tokens) + n(voice.output_tokens))} tokens`}
                />
                <StatCard label="Voice orders" value={count(voice.voice_orders)} hint={`${count(voice.turns)} replies · ${count(voice.users)} customers`} />
                <StatCard
                  label="AI cost per voice order"
                  value={n(voice.voice_orders) ? naira(n(voice.cost_ngn) / n(voice.voice_orders)) : '—'}
                  hint={n(voice.pro_max_revenue) - n(voice.cost_ngn) >= 0 ? `Covered: ${naira(n(voice.pro_max_revenue) - n(voice.cost_ngn))} left over` : 'Not covered: raise the Pro Max price or limits'}
                />
              </div>
            </Card>
          )}

          {milestones.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-4 flex items-center gap-2 font-semibold"><Trophy className="size-4 text-warn" />Milestones (all time)</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {milestones.map(m => {
                  const fmt = (v: number) => (m.money ? naira(v) : v.toLocaleString());
                  return (
                    <div key={m.label} className="rounded-lg border border-line bg-surface-2 p-4 text-sm">
                      <div className="text-ink-2">{m.label}</div>
                      <div className="mt-1 text-xl font-semibold">{fmt(m.value)}</div>
                      <div className="mt-1 text-xs text-ink-3">
                        {m.reached ? `Passed ${fmt(m.reached)}` : 'First milestone ahead'}
                        {m.next ? ` · next ${fmt(m.next)} (${fmt(m.next - m.value)} to go)` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="font-semibold">Month by month</h2>
              <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={exportMonths} disabled={!months.length}>Export CSV</Button>
            </div>
            {months.length === 0 ? (
              <div className="p-5 text-sm text-ink-3">No activity in this period.</div>
            ) : (
              <Table
                head={
                  <tr>
                    <Th>Month</Th>
                    <Th className="text-right">Orders</Th>
                    <Th className="text-right">Delivered</Th>
                    <Th className="text-right">GMV</Th>
                    <Th className="text-right">Commission</Th>
                    <Th className="text-right">Pro</Th>
                    <Th className="text-right">Promotions</Th>
                    <Th className="text-right">Vesphe revenue</Th>
                    <Th className="text-right">Refunds</Th>
                    <Th className="text-right">New customers</Th>
                    <Th className="text-right">New vendors</Th>
                  </tr>
                }
              >
                {months.map(m => (
                  <tr key={m.month}>
                    <Td className="font-medium">{monthLabel(m.month)}</Td>
                    <Td className="text-right">{count(m.orders)}</Td>
                    <Td className="text-right">{count(m.delivered)}</Td>
                    <Td className="text-right">{naira(m.gmv)}</Td>
                    <Td className="text-right">{naira(m.commission)}</Td>
                    <Td className="text-right">{naira(m.pro_revenue)}</Td>
                    <Td className="text-right">{naira(m.promotion_revenue)}</Td>
                    <Td className="text-right font-medium text-brand">
                      {naira(n(m.commission) + n(m.service_fees) + n(m.delivery_share) + n(m.pro_revenue) + n(m.promotion_revenue) + n(m.logistics_share))}
                    </Td>
                    <Td className="text-right">{naira(m.refunds)}</Td>
                    <Td className="text-right">{count(m.new_customers)}</Td>
                    <Td className="text-right">{count(m.new_vendors)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <p className="text-xs text-ink-3">
            Cancelled orders are left out of sales and payouts. Months use Lagos time.
          </p>
        </>
      )}
    </div>
  );
}

function Breakdown({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <dl className="divide-y divide-line text-sm">{children}</dl>
    </Card>
  );
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-ink-2">{label}</dt>
      <dd className={strong ? 'font-semibold text-brand' : warn ? 'font-medium text-warn' : 'font-medium'}>{value}</dd>
    </div>
  );
}
