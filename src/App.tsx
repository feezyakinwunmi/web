import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { FeedbackProvider } from './components/Toast';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { Login, NotAllowed } from './pages/Login';
const VendorDashboard = lazy(() => import('./pages/vendor/VendorDashboard').then(m => ({ default: m.VendorDashboard })));
const VendorOrders = lazy(() => import('./pages/vendor/VendorOrders').then(m => ({ default: m.VendorOrders })));
const VendorMenu = lazy(() => import('./pages/vendor/VendorMenu').then(m => ({ default: m.VendorMenu })));
const VendorEarnings = lazy(() => import('./pages/vendor/VendorEarnings').then(m => ({ default: m.VendorEarnings })));
const VendorSettings = lazy(() => import('./pages/vendor/VendorSettings').then(m => ({ default: m.VendorSettings })));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview').then(m => ({ default: m.AdminOverview })));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders').then(m => ({ default: m.AdminOrders })));
const AdminVendors = lazy(() => import('./pages/admin/AdminVendors').then(m => ({ default: m.AdminVendors })));
const AdminMenuApprovals = lazy(() => import('./pages/admin/AdminMenuApprovals').then(m => ({ default: m.AdminMenuApprovals })));
const AdminPromotions = lazy(() => import('./pages/admin/AdminPromotions').then(m => ({ default: m.AdminPromotions })));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then(m => ({ default: m.AdminUsers })));
const AdminWithdrawals = lazy(() => import('./pages/admin/AdminWithdrawals').then(m => ({ default: m.AdminWithdrawals })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then(m => ({ default: m.AdminSettings })));
const AdminReports = lazy(() => import('./pages/admin/AdminReports').then(m => ({ default: m.AdminReports })));
const AdminRiders = lazy(() => import('./pages/admin/AdminRiders').then(m => ({ default: m.AdminRiders })));
const AdminSubscriptions = lazy(() => import('./pages/admin/AdminSubscriptions').then(m => ({ default: m.AdminSubscriptions })));
const AdminFleet = lazy(() => import('./pages/admin/AdminFleet').then(m => ({ default: m.AdminFleet })));
const AdminCashPayouts = lazy(() => import('./pages/admin/AdminCashPayouts').then(m => ({ default: m.AdminCashPayouts })));
const AdminComplaints = lazy(() => import('./pages/admin/AdminComplaints').then(m => ({ default: m.AdminComplaints })));
const VendorPromote = lazy(() => import('./pages/vendor/VendorPromote').then(m => ({ default: m.VendorPromote })));
const VendorSupport = lazy(() => import('./pages/vendor/VendorSupport').then(m => ({ default: m.VendorSupport })));
const NotificationsPage = lazy(() => import('./pages/Notifications').then(m => ({ default: m.NotificationsPage })));

// Route guard: signed in, has a profile, not suspended, and the right role.
function RequireRole({ role, children }: { role: 'vendor' | 'admin'; children: ReactNode }) {
  const { session, profile, loading, adminVerified } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <NotAllowed reason="no-profile" />;
  // Admins need the emailed sign-in code as well as the password.
  if (profile.role === 'admin' && !adminVerified) return <Navigate to="/login" replace />;
  if (profile.is_suspended) return <NotAllowed reason="suspended" />;
  if (profile.role !== role) {
    if (profile.role === 'vendor' || profile.role === 'admin') return <Navigate to={`/${profile.role}`} replace />;
    return <NotAllowed reason="role" />;
  }
  return <>{children}</>;
}

function Home() {
  const { session, profile, loading, adminVerified } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role === 'admin') return <Navigate to={adminVerified ? '/admin' : '/login'} replace />;
  if (profile?.role === 'vendor') return <Navigate to="/vendor" replace />;
  return <NotAllowed reason={profile ? 'role' : 'no-profile'} />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <FeedbackProvider>
          <Suspense fallback={<Spinner label="Loading…" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />

            <Route element={<RequireRole role="vendor"><AppShell /></RequireRole>}>
              <Route path="/vendor" element={<VendorDashboard />} />
              <Route path="/vendor/orders" element={<VendorOrders />} />
              <Route path="/vendor/menu" element={<VendorMenu />} />
              <Route path="/vendor/earnings" element={<VendorEarnings />} />
              <Route path="/vendor/settings" element={<VendorSettings />} />
              <Route path="/vendor/promote" element={<VendorPromote />} />
              <Route path="/vendor/support" element={<VendorSupport />} />
              <Route path="/vendor/notifications" element={<NotificationsPage />} />
            </Route>

            <Route element={<RequireRole role="admin"><AppShell /></RequireRole>}>
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/vendors" element={<AdminVendors />} />
              <Route path="/admin/menu" element={<AdminMenuApprovals />} />
              <Route path="/admin/promotions" element={<AdminPromotions />} />
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/withdrawals" element={<AdminWithdrawals />} />
              <Route path="/admin/cash-payouts" element={<AdminCashPayouts />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/admin/reports" element={<AdminReports />} />
              <Route path="/admin/riders" element={<AdminRiders />} />
              <Route path="/admin/fleet" element={<AdminFleet />} />
              <Route path="/admin/subscriptions" element={<AdminSubscriptions />} />
              <Route path="/admin/complaints" element={<AdminComplaints />} />
              <Route path="/admin/notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </FeedbackProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
