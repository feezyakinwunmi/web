import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Button, Field, Input, PasswordInput, Spinner } from '../components/ui';
import { isConfigured } from '../lib/supabase';

const RESEND_SECONDS = 60;

export function Login() {
  const { session, profile, loading: authLoading, adminVerified, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading) return <Spinner label="Loading…" />;
  if (session && profile?.role === 'admin' && !adminVerified) return <AdminCodeStep />;
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;
  if (profile?.role === 'vendor') return <Navigate to="/vendor" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError((err as Error).message || 'Could not sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard subtitle="For vendors and admins. Use your Vesphe app login.">
      {!isConfigured && (
        <div className="mb-4 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
          Not configured: copy <code>.env.example</code> to <code>.env</code> and add your Supabase keys.
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-6">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <PasswordInput autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
        <p className="text-center text-xs text-ink-3">Forgot your password? Reset it from the Vesphe app.</p>
      </form>
    </AuthCard>
  );
}

// Second step for admins: a 6-digit code emailed to them after the password.
function AdminCodeStep() {
  const { session, sendAdminCode, verifyAdminCode, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const sentOnce = useRef(false);

  const send = async () => {
    setError('');
    setSending(true);
    try {
      await sendAdminCode();
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError((err as Error).message || 'Could not send the code');
    } finally {
      setSending(false);
    }
  };

  // Send the first code automatically.
  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) return setError('Enter the 6-digit code');
    setError('');
    setVerifying(true);
    try {
      await verifyAdminCode(code);
    } catch (err) {
      setError((err as Error).message || 'That code did not work');
      setVerifying(false);
    }
  };

  return (
    <AuthCard subtitle="Admin sign-in check">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-surface p-6">
        <div className="flex gap-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-brand" />
          <div className="text-ink-2">
            We sent a 6-digit code to <span className="font-medium text-ink">{session?.user?.email}</span>.
            Enter it to open the admin dashboard.
          </div>
        </div>
        <Field label="Sign-in code">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center text-lg tracking-[0.5em]"
          />
        </Field>
        {error && <p className="text-sm text-bad">{error}</p>}
        <Button type="submit" loading={verifying} className="w-full">Verify and continue</Button>
        <div className="flex items-center justify-between text-xs">
          <button type="button" onClick={send} disabled={sending || cooldown > 0} className="text-brand hover:underline disabled:text-ink-3 disabled:no-underline">
            {cooldown > 0 ? `Resend code in ${cooldown}s` : sending ? 'Sending…' : 'Resend code'}
          </button>
          <button type="button" onClick={signOut} className="text-ink-2 hover:text-ink">Use a different account</button>
        </div>
      </form>
    </AuthCard>
  );
}

function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Vesphe" className="mx-auto mb-4 h-12 w-auto" />
          <h1 className="text-2xl font-semibold">Vesphe Dashboard</h1>
          <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function NotAllowed({ reason }: { reason: 'role' | 'suspended' | 'no-profile' }) {
  const { signOut } = useAuth();
  const text = {
    role: 'This dashboard is for vendors and admins. Customers and riders should use the Vesphe mobile apps.',
    suspended: 'This account is suspended. Contact Vesphe support for help.',
    'no-profile': 'We could not find a Vesphe profile for this login. Finish signing up in the Vesphe app first.',
  }[reason];
  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <div className="max-w-sm rounded-xl border border-line bg-surface p-6 text-center">
        <h1 className="mb-2 text-lg font-semibold">Can't open the dashboard</h1>
        <p className="mb-5 text-sm text-ink-2">{text}</p>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
