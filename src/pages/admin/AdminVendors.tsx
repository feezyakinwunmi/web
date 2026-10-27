import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Landmark, MapPin, Phone, Mail, Search, Store } from 'lucide-react';
import { useFeedback } from '../../components/Toast';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, PageHeader, Select, Spinner, Table, Tabs, Td, Th } from '../../components/ui';
import { fetchAll, invokeFunction, supabase } from '../../lib/supabase';
import { dateOnly } from '../../lib/format';
import { BANKS, findBank } from '../../lib/banks';
import type { Vendor } from '../../lib/types';

type Filter = 'pending' | 'approved' | 'suspended' | 'all';

const vendorStatus = (v: Vendor): Exclude<Filter, 'all'> =>
  v.is_suspended ? 'suspended' : v.is_approved ? 'approved' : 'pending';

export function AdminVendors() {
  const { toast, confirm } = useFeedback();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchAll<Vendor>((from, to) =>
      supabase.from('vendors').select('*').order('created_at', { ascending: false }).range(from, to)
    );
    if (error) toast(error.message, 'error');
    const list = (data as Vendor[]) || [];
    setVendors(list);
    setSelected(prev => (prev ? list.find(v => v.id === prev.id) || null : null));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const count = (f: Filter) => (f === 'all' ? vendors.length : vendors.filter(v => vendorStatus(v) === f).length);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors
      .filter(v => filter === 'all' || vendorStatus(v) === filter)
      .filter(v => !q || v.name.toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q) || v.phone.includes(q));
  }, [vendors, filter, query]);

  const update = async (vendor: Vendor, changes: Partial<Vendor>, message: string) => {
    setBusy(true);
    const { error } = await supabase.from('vendors').update(changes).eq('id', vendor.id);
    setBusy(false);
    if (error) return toast(error.message, 'error');
    toast(message);
    load();
  };

  const approve = (v: Vendor) => update(v, { is_approved: true, is_suspended: false }, `${v.name} approved`);
  const unsuspend = (v: Vendor) => update(v, { is_suspended: false }, `${v.name} reactivated`);
  const suspend = async (v: Vendor) => {
    const ok = await confirm({
      title: `Suspend ${v.name}?`,
      message: 'Their store will be hidden from customers until you reactivate it.',
      confirmLabel: 'Suspend vendor',
      danger: true,
    });
    if (ok) update(v, { is_suspended: true }, `${v.name} suspended`);
  };

  return (
    <div>
      <PageHeader title="Vendors" subtitle="Approve new stores, suspend problem accounts and fix payout details." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: 'Awaiting approval', count: count('pending') },
            { value: 'approved', label: 'Approved', count: count('approved') },
            { value: 'suspended', label: 'Suspended', count: count('suspended') },
            { value: 'all', label: 'All', count: count('all') },
          ]}
        />
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input placeholder="Name, email or phone" value={query} onChange={e => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        {loading ? (
          <Spinner label="Loading vendors…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Store className="size-8" />} title="No vendors here" />
        ) : (
          <Table
            head={
              <tr>
                <Th>Store</Th>
                <Th>Contact</Th>
                <Th>Payout account</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th className="text-right">Action</Th>
              </tr>
            }
          >
            {visible.map(v => {
              const status = vendorStatus(v);
              return (
                <tr key={v.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(v)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {v.image_url ? <img src={v.image_url} alt="" className="size-10 rounded-lg object-cover" /> : <div className="size-10 rounded-lg bg-surface-3" />}
                      <div>
                        <div className="font-medium">{v.name}</div>
                        <div className="text-xs capitalize text-ink-3">{v.category}</div>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-ink-2">
                    <div>{v.phone}</div>
                    <div className="text-xs text-ink-3">{v.email}</div>
                  </Td>
                  <Td>{v.paystack_subaccount_code ? <Badge tone="ok">Ready</Badge> : <Badge tone="warn">Not set up</Badge>}</Td>
                  <Td className="text-ink-2">{dateOnly(v.created_at)}</Td>
                  <Td>
                    <Badge tone={status === 'approved' ? 'ok' : status === 'suspended' ? 'bad' : 'warn'}>
                      {status === 'pending' ? 'awaiting approval' : status}
                    </Badge>
                  </Td>
                  <Td className="text-right" >
                    <div onClick={e => e.stopPropagation()} className="inline-flex">
                      {status === 'pending' && <Button size="sm" disabled={busy} onClick={() => approve(v)}>Approve</Button>}
                      {status === 'suspended' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => unsuspend(v)}>Reactivate</Button>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {selected && (
        <VendorDrawer
          key={selected.id}
          vendor={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onApprove={() => approve(selected)}
          onSuspend={() => suspend(selected)}
          onUnsuspend={() => unsuspend(selected)}
          onBankSaved={load}
        />
      )}
    </div>
  );
}

function VendorDrawer({ vendor, busy, onClose, onApprove, onSuspend, onUnsuspend, onBankSaved }: {
  vendor: Vendor;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onSuspend: () => void;
  onUnsuspend: () => void;
  onBankSaved: () => void;
}) {
  const { toast } = useFeedback();
  const status = vendorStatus(vendor);
  const [bank, setBank] = useState(findBank(vendor.bank_name)?.value || '');
  const [accountNumber, setAccountNumber] = useState(vendor.account_number || '');
  const [resolvedName, setResolvedName] = useState('');
  const [working, setWorking] = useState(false);
  const selectedBank = BANKS.find(b => b.value === bank);

  const verify = async () => {
    if (!selectedBank || !/^\d{10}$/.test(accountNumber)) return toast('Choose a bank and enter a 10-digit account number', 'error');
    setWorking(true);
    try {
      const res = await invokeFunction<{ data: { account_name: string } }>('verify-bank', { account_number: accountNumber, bank_code: selectedBank.code });
      setResolvedName(res.data.account_name);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!selectedBank) return;
    setWorking(true);
    try {
      await invokeFunction('setup-subaccount', {
        vendor_id: vendor.id,
        account_number: accountNumber,
        bank_code: selectedBank.code,
        bank_name: selectedBank.value,
      });
      toast(`Payout account saved for ${vendor.name}`);
      setResolvedName('');
      onBankSaved();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={vendor.name}
      footer={
        <>
          {status === 'pending' && <Button disabled={busy} onClick={onApprove}>Approve store</Button>}
          {status === 'approved' && <Button variant="danger" disabled={busy} onClick={onSuspend}>Suspend</Button>}
          {status === 'suspended' && <Button variant="secondary" disabled={busy} onClick={onUnsuspend}>Reactivate</Button>}
        </>
      }
    >
      <div className="space-y-6 text-sm">
        {vendor.cover_image_url && <img src={vendor.cover_image_url} alt="" className="h-32 w-full rounded-xl object-cover" />}
        {vendor.description && <p className="text-ink-2">{vendor.description}</p>}
        <div className="space-y-2 rounded-lg border border-line p-4">
          <div className="flex items-center gap-2"><Phone className="size-4 text-ink-3" />{vendor.phone}</div>
          {vendor.email && <div className="flex items-center gap-2"><Mail className="size-4 text-ink-3" />{vendor.email}</div>}
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-ink-3" />{vendor.address}</div>
        </div>

        <section>
          <div className="mb-2 flex items-center gap-2 font-semibold"><Landmark className="size-4 text-ink-3" />Payout account</div>
          {vendor.paystack_subaccount_code ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/10 p-3">
              <CheckCircle2 className="size-4 text-ok" />
              {vendor.account_name} · {(vendor.bank_name || '').toUpperCase()} {vendor.account_number}
            </div>
          ) : (
            <p className="mb-3 text-warn">Not set up — this store can't take card payments yet.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bank">
              <Select value={bank} onChange={e => { setBank(e.target.value); setResolvedName(''); }}>
                <option value="">Choose bank</option>
                {BANKS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </Select>
            </Field>
            <Field label="Account number">
              <Input inputMode="numeric" maxLength={10} value={accountNumber} onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, '')); setResolvedName(''); }} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!resolvedName ? (
              <Button variant="secondary" size="sm" loading={working} onClick={verify}>Verify account</Button>
            ) : (
              <>
                <span>Account name: <span className="font-semibold">{resolvedName}</span></span>
                <Button size="sm" loading={working} onClick={save}>Save as payout account</Button>
              </>
            )}
          </div>
        </section>
      </div>
    </Drawer>
  );
}
