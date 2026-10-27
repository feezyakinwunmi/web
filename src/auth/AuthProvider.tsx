import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Role, Vendor } from '../lib/types';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar_url: string | null;
  is_suspended: boolean;
}

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  vendor: Vendor | null;
  loading: boolean;
  // Admins must also enter a code emailed to them; true once they have (12 hours).
  adminVerified: boolean;
  signIn: (email: string, password: string) => Promise<Profile | null>;
  sendAdminCode: () => Promise<void>;
  verifyAdminCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshVendor: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

const CODE_METHODS = ['otp', 'magiclink', 'totp'];
const CODE_VALID_SECONDS = 12 * 3600;

// Same rule as public.admin_code_verified() in the database: the session's
// sign-in methods (JWT "amr" claim) include a one-time code from the last 12 hours.
export function sessionHasRecentCode(session: Session | null) {
  if (!session?.access_token) return false;
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')));
    const now = Date.now() / 1000;
    return (claims.amr || []).some(
      (m: { method?: string; timestamp?: number }) =>
        CODE_METHODS.includes(m.method || '') && (m.timestamp || 0) > now - CODE_VALID_SECONDS
    );
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);

  const loadVendor = useCallback(async (userId: string) => {
    const { data } = await supabase.from('vendors').select('*').eq('owner_id', userId).maybeSingle();
    setVendor((data as Vendor) || null);
  }, []);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      setVendor(null);
      return null;
    }
    const { data } = await supabase
      .from('users')
      .select('id, email, name, role, avatar_url, is_suspended')
      .eq('id', s.user.id)
      .maybeSingle();
    const p = data ? ({ ...data, is_suspended: !!data.is_suspended } as Profile) : null;
    setProfile(p);
    if (p?.role === 'vendor') await loadVendor(p.id);
    else setVendor(null);
    return p;
  }, [loadVendor]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: Supabase recommends not awaiting queries inside this callback.
        setTimeout(() => loadProfile(s), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return loadProfile(data.session);
  };

  // Emails a 6-digit code to the signed-in admin (Supabase Auth email OTP).
  const sendAdminCode = async () => {
    const email = session?.user?.email;
    if (!email) throw new Error('Sign in first');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) throw error;
  };

  // Exchanges the code for a new session that is marked as code-verified.
  const verifyAdminCode = async (code: string) => {
    const email = session?.user?.email;
    if (!email) throw new Error('Sign in first');
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
    if (error) throw error;
    setSession(data.session);
    await loadProfile(data.session);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setVendor(null);
  };

  const refreshVendor = async () => {
    if (profile?.role === 'vendor') await loadVendor(profile.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session, profile, vendor, loading,
        adminVerified: sessionHasRecentCode(session),
        signIn, sendAdminCode, verifyAdminCode, signOut, refreshVendor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
