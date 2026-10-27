import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Copy } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Table, Tabs, Td, Th } from '../../components/ui';
import { fetchAll, supabase } from '../../lib/supabase';
import { dateTime, naira, titleCase } from '../../lib/format';

interface Withdrawal {
  id: string;
  user_id: string | null;
  user_type: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  processed_at: string | null;
  user?: { name: string; email: string | null } | null;
}

type Filter = 'open' | 'done' | 'all';
const OPEN = ['pending', 'processing'];

export function AdminWithdrawals() {
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('open');

  const load = useCallback(async () => {
    const { data, error } = await fetchAll<Withdrawal>((from, to) =>
      supabase
        .from('withdrawals')
        .select('*, user:user_id(name, email)')
        .order('created_at', { ascending: false })
        .range(from, to)
    );
    if (error) toast(error.message, 'error');
    setItems((data as Withdrawal[]) || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => items.filter(w => (filter === 'all' ? true : filter === 'open' ? OPEN.includes(w.status || 'pending') : !OPEN.includes(w.status || 'pending'))),
    [items, filter]
  );
  const openTotal = items.filter(w => OPEN.includes(w.status || 'pending')).reduce((s, w) => s + w.amount, 0);

  // Vendors are paid automatically by Paystack split payments. These requests (riders,
  // old vendor wallet balances) are paid by the admin outside the app, then recorded here.
  const markPaid = async (w: Withdrawal) => {
    const ok = await confirm({
      title: 'Mark as paid?',
      message: `Only confirm after you have sent ${naira(w.amount)} to ${w.account_name} (${w.bank_name.toUpperCase()} ${w.account_number}) from your bank app or the Paystack dashboard. This page does not send money.`,
      confirmLabel: 'I have paid this',
    });
    if (!ok) return;
    const { error } = await supabase
      .from('withdrawals')
      .update({ status: 'completed', processed_at: new Date().toISOString(), notes: 'Paid manually by admin' })
      .eq('id', w.id);
    if (error) return toast(error.message, 'error');
    toast('Withdrawal marked as paid');
    load();
  };

  const reject = async (w: Withdrawal) => {
    const ok = await confirm({ title: 'Reject withdrawal?', message: 'The request will be marked as failed.', confirmLabel: 'Reject', danger: true });
    if (!ok) return;
    const { error } = await supabase
      .from('withdrawals')
      .update({ status: 'failed', processed_at: new Date().toISOString(), notes: 'Rejected by admin' })
      .eq('id', w.id);
    if (error) return toast(error.message, 'error');
    toast('Withdrawal rejected');
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast('Copied', 'info'));
  };

  return (
    <div>
      <PageHeader
        title="Withdrawals"
        subtitle={`Manual payouts (riders and old vendor wallet balances). Open: ${naira(openTotal)}`}
      />
      <div className="mb-4">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'To pay', count: items.filter(w => OPEN.includes(w.status || 'pending')).length },
            { value: 'done', label: 'Done' },
            { value: 'all', label: 'All', count: items.length },
          ]}
        />
      </div>
      <Card>
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Banknote className="size-8" />} title="Nothing to pay" />
        ) : (
          <Table
            head={
              <tr>
                <Th>Requested by</Th>
                <Th>Amount</Th>
                <Th>Pay to</Th>
                <Th>Requested</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            }
          >
            {visible.map(w => {
              const open = OPEN.includes(w.status || 'pending');
              return (
                <tr key={w.id}>
                  <Td>
                    <div className="font-medium">{w.user?.name || '—'}</div>
                    <div className="text-xs text-ink-3">{titleCase(w.user_type)}</div>
                  </Td>
                  <Td className="font-semibold">{naira(w.amount)}</Td>
                  <Td>
                    <div>{w.account_name}</div>
                    <button onClick={() => copy(w.account_number)} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink">
                      {w.bank_name.toUpperCase()} {w.account_number} <Copy className="size-3" />
                    </button>
                  </Td>
                  <Td className="text-ink-2">{dateTime(w.created_at)}</Td>
                  <Td>
                    <Badge tone={open ? 'warn' : w.status === 'failed' ? 'bad' : 'ok'}>{w.status || 'pending'}</Badge>
                  </Td>
                  <Td className="text-right">
                    {open && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => reject(w)}>Reject</Button>
                        <Button size="sm" variant="success" onClick={() => markPaid(w)}>Mark as paid</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
