import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Wallet, Settings, Store, ClipboardCheck,
  Users, Banknote, Megaphone, Menu as MenuIcon, LogOut, X, Bike, Crown, LineChart, MessageSquareWarning, Bell, LifeBuoy,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { NotificationsProvider } from '../lib/notifications';
import { NotificationBell } from './NotificationBell';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const VENDOR_NAV: NavItem[] = [
  { to: '/vendor', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  { to: '/vendor/orders', label: 'Orders', icon: <ShoppingBag className="size-4" /> },
  { to: '/vendor/menu', label: 'Menu', icon: <UtensilsCrossed className="size-4" /> },
  { to: '/vendor/earnings', label: 'Earnings', icon: <Wallet className="size-4" /> },
  { to: '/vendor/support', label: 'Support', icon: <LifeBuoy className="size-4" /> },
  { to: '/vendor/notifications', label: 'Notifications', icon: <Bell className="size-4" /> },
  { to: '/vendor/settings', label: 'Settings', icon: <Settings className="size-4" /> },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard className="size-4" /> },
  { to: '/admin/reports', label: 'Reports', icon: <LineChart className="size-4" /> },
  { to: '/admin/orders', label: 'Orders', icon: <ShoppingBag className="size-4" /> },
  { to: '/admin/vendors', label: 'Vendors', icon: <Store className="size-4" /> },
  { to: '/admin/riders', label: 'Riders', icon: <Bike className="size-4" /> },
  { to: '/admin/menu', label: 'Menu approvals', icon: <ClipboardCheck className="size-4" /> },
  { to: '/admin/promotions', label: 'Promotions', icon: <Megaphone className="size-4" /> },
  { to: '/admin/users', label: 'Users', icon: <Users className="size-4" /> },
  { to: '/admin/subscriptions', label: 'Pro subscriptions', icon: <Crown className="size-4" /> },
  { to: '/admin/complaints', label: 'Complaints', icon: <MessageSquareWarning className="size-4" /> },
  { to: '/admin/withdrawals', label: 'Withdrawals', icon: <Banknote className="size-4" /> },
  { to: '/admin/notifications', label: 'Notifications', icon: <Bell className="size-4" /> },
  { to: '/admin/settings', label: 'Settings', icon: <Settings className="size-4" /> },
];

export function AppShell() {
  const { profile, vendor, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = profile?.role === 'admin';
  const nav = isAdmin ? ADMIN_NAV : VENDOR_NAV;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-8 w-auto" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Vesphe</div>
          <div className="text-xs text-ink-3">{isAdmin ? 'Admin' : 'Vendor'} dashboard</div>
        </div>
        <div className="hidden lg:block"><NotificationBell /></div>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/vendor' || item.to === '/admin'}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand/15 text-brand' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>
      <div className="border-t border-line p-4">
        <div className="mb-3 min-w-0">
          <div className="truncate text-sm font-medium">{vendor?.name || profile?.name}</div>
          <div className="truncate text-xs text-ink-3">{profile?.email}</div>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <NotificationsProvider>
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-64 border-r border-line bg-surface">
            <button className="absolute right-3 top-5 text-ink-2" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="text-ink-2" aria-label="Open menu">
            <MenuIcon className="size-5" />
          </button>
          <span className="flex-1 font-semibold">Vesphe</span>
          <NotificationBell align="right" />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
    </NotificationsProvider>
  );
}
