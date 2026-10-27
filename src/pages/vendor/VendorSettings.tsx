import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ImagePlus, Landmark } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../components/Toast';
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea, Toggle } from '../../components/ui';
import { invokeFunction, supabase } from '../../lib/supabase';
import { BANKS, findBank } from '../../lib/banks';

const BUSINESS_CATEGORIES = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'fastfood', label: 'Fast Food' },
  { value: 'local', label: 'Local Cuisine' },
  { value: 'seafood', label: 'Seafood' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'pharmacy', label: 'Pharmacy' },
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function VendorSettings() {
  const { vendor, refreshVendor } = useAuth();
  const { toast } = useFeedback();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bank, setBank] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [savingBank, setSavingBank] = useState(false);

  useEffect(() => {
    if (!vendor) return;
    setName(vendor.name || '');
    setDescription(vendor.description || '');
    setCategory(vendor.category || '');
    setPhone(vendor.phone || '');
    setEmail(vendor.email || '');
    setAddress(vendor.address || '');
    setDeliveryTime(vendor.delivery_time || '');
    setMinOrder(vendor.min_order?.toString() || '');
    setIsOpen(vendor.is_open ?? true);
    setBank(findBank(vendor.bank_name)?.value || '');
    setAccountNumber(vendor.account_number || '');
  }, [vendor]);

  if (!vendor) return <EmptyState title="No store found" text="Finish setting up your store in the Vesphe app." />;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !address.trim()) return toast('Name, phone and address are required', 'error');
    setSaving(true);
    const { error } = await supabase
      .from('vendors')
      .update({
        name: name.trim(),
        description: description.trim(),
        category,
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim(),
        delivery_time: deliveryTime.trim() || null,
        min_order: minOrder ? Math.max(0, Math.round(Number(minOrder))) : null,
        is_open: isOpen,
      })
      .eq('id', vendor.id);
    setSaving(false);
    if (error) return toast(error.message, 'error');
    toast('Store details saved');
    refreshVendor();
  };

  const uploadImage = async (file: File | undefined, kind: 'logo' | 'cover') => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Please choose an image file', 'error');
    if (file.size > MAX_IMAGE_BYTES) return toast('Image must be under 5 MB', 'error');
    const bucket = kind === 'logo' ? 'vendor-avatars' : 'vendor-covers';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${vendor.id}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
    if (error) return toast(`Upload failed: ${error.message}`, 'error');
    const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    const { error: updateError } = await supabase
      .from('vendors')
      .update(kind === 'logo' ? { image_url: url } : { cover_image_url: url })
      .eq('id', vendor.id);
    if (updateError) return toast(updateError.message, 'error');
    toast(kind === 'logo' ? 'Logo updated' : 'Cover photo updated');
    refreshVendor();
  };

  const selectedBank = BANKS.find(b => b.value === bank);

  const verify = async () => {
    if (!selectedBank || !/^\d{10}$/.test(accountNumber)) return toast('Choose a bank and enter a 10-digit account number', 'error');
    setVerifying(true);
    setResolvedName('');
    try {
      const res = await invokeFunction<{ data: { account_name: string } }>('verify-bank', {
        account_number: accountNumber,
        bank_code: selectedBank.code,
      });
      setResolvedName(res.data.account_name);
    } catch (err) {
      toast((err as Error).message || 'Could not verify account', 'error');
    } finally {
      setVerifying(false);
    }
  };

  // Creates/updates the Paystack subaccount: card payments settle straight to this account.
  const saveBank = async () => {
    if (!selectedBank || !resolvedName) return;
    setSavingBank(true);
    try {
      await invokeFunction('setup-subaccount', {
        account_number: accountNumber,
        bank_code: selectedBank.code,
        bank_name: selectedBank.value,
      });
      toast('Payout account saved — card payments will go to this account');
      setResolvedName('');
      refreshVendor();
    } catch (err) {
      toast((err as Error).message || 'Could not save payout account', 'error');
    } finally {
      setSavingBank(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your store profile and payout account." />

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Photos</h2>
        <div className="flex flex-wrap gap-6">
          <ImageUpload label="Logo" url={vendor.image_url} square onPick={f => uploadImage(f, 'logo')} />
          <ImageUpload label="Cover photo" url={vendor.cover_image_url} onPick={f => uploadImage(f, 'cover')} />
        </div>
      </Card>

      <Card className="p-6">
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Store details</h2>
            <Toggle checked={isOpen} onChange={setIsOpen} label={isOpen ? 'Open for orders' : 'Closed'} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Store name"><Input value={name} onChange={e => setName(e.target.value)} required /></Field>
            <Field label="Category">
              <Select value={category} onChange={e => setCategory(e.target.value)}>
                {BUSINESS_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Phone"><Input value={phone} onChange={e => setPhone(e.target.value)} required /></Field>
            <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Delivery time" hint="e.g. 30-45 min"><Input value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} /></Field>
            <Field label="Minimum order (₦)"><Input type="number" min={0} value={minOrder} onChange={e => setMinOrder(e.target.value)} /></Field>
          </div>
          <Field label="Address" hint="To change your map pin, use the Vesphe app.">
            <Input value={address} onChange={e => setAddress(e.target.value)} required />
          </Field>
          <Field label="Description"><Textarea value={description} onChange={e => setDescription(e.target.value)} /></Field>
          <div className="flex justify-end"><Button type="submit" loading={saving}>Save details</Button></div>
        </form>
      </Card>

      <Card className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <Landmark className="size-5 text-ink-3" />
          <h2 className="font-semibold">Payout account</h2>
        </div>
        <p className="mb-4 text-sm text-ink-2">
          Card payments are split automatically: your share goes straight to this account (usually next business day).
        </p>

        {vendor.paystack_subaccount_code && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/10 p-3 text-sm">
            <CheckCircle2 className="size-4 text-ok" />
            <span>
              Active: <span className="font-medium">{vendor.account_name}</span> · {(vendor.bank_name || '').toUpperCase()} ••••
              {(vendor.account_number || '').slice(-4)}
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Bank">
            <Select value={bank} onChange={e => { setBank(e.target.value); setResolvedName(''); }}>
              <option value="">Choose your bank</option>
              {BANKS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </Select>
          </Field>
          <Field label="Account number">
            <Input
              inputMode="numeric"
              maxLength={10}
              value={accountNumber}
              onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, '')); setResolvedName(''); }}
            />
          </Field>
          <Button variant="secondary" onClick={verify} loading={verifying}>Verify</Button>
        </div>

        {resolvedName && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-4">
            <div className="text-sm">
              Account name: <span className="font-semibold">{resolvedName}</span>
              <div className="text-xs text-ink-3">Make sure this is your business or your own account.</div>
            </div>
            <Button onClick={saveBank} loading={savingBank}>Use this account</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function ImageUpload({ label, url, square, onPick }: { label: string; url: string | null; square?: boolean; onPick: (f: File | undefined) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-ink-2">{label}</div>
      <label
        className={`flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-surface-2 text-ink-3 hover:border-brand ${square ? 'size-28' : 'h-28 w-64'}`}
      >
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-7" />}
        <input type="file" accept="image/*" className="hidden" onChange={e => onPick(e.target.files?.[0])} />
      </label>
    </div>
  );
}
