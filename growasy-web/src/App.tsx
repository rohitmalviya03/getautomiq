import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { setUnauthorizedHandler } from '@/lib/api-client';
import { useBootstrapAuth } from '@/hooks/use-bootstrap-auth';
import { usePageTracking } from '@/hooks/use-page-tracking';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SuperAdminRoute } from '@/components/auth/SuperAdminRoute';
import { PublicOnlyRoute } from '@/components/auth/PublicOnlyRoute';
import { FullPageSpinner } from '@/components/ui/FullPageSpinner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { DashboardHome } from '@/pages/dashboard/DashboardHome';
import { ProfilePage } from '@/pages/dashboard/ProfilePage';
import { SessionsPage } from '@/pages/dashboard/SessionsPage';
import { OrganizationPage } from '@/pages/dashboard/OrganizationPage';
import { InstagramAccountsPage } from '@/pages/dashboard/InstagramAccountsPage';
import { InstagramCallbackPage } from '@/pages/dashboard/InstagramCallbackPage';
import { AutomationsPage } from '@/pages/dashboard/AutomationsPage';
import { ContentPage } from '@/pages/dashboard/ContentPage';
import { ContactsPage } from '@/pages/dashboard/ContactsPage';
import { AnalyticsPage } from '@/pages/dashboard/AnalyticsPage';
import { LinksPage } from '@/pages/dashboard/LinksPage';
import { BillingPage } from '@/pages/dashboard/BillingPage';
import { WorkflowsPage } from '@/pages/dashboard/WorkflowsPage';
import { WorkflowBuilderPage } from '@/pages/dashboard/WorkflowBuilderPage';
import { AdminLayout } from '@/pages/admin/AdminLayout';
import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import { AdminCustomersPage } from '@/pages/admin/AdminCustomersPage';
import { AdminCustomerDetailPage } from '@/pages/admin/AdminCustomerDetailPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { HelpCenterPage } from '@/pages/dashboard/HelpCenterPage';
import { AdminTrafficPage } from '@/pages/admin/AdminTrafficPage';
import { AdminTicketsPage } from '@/pages/admin/AdminTicketsPage';
import { AdminPricingPage } from '@/pages/admin/AdminPricingPage';
import { AdminCouponsPage } from '@/pages/admin/AdminCouponsPage';
import { AdminAuditPage } from '@/pages/admin/AdminAuditPage';
import { ToolsHubPage } from '@/pages/tools/ToolsHubPage';
import { ToolDetailPage } from '@/pages/tools/ToolDetailPage';
import { PrivacyPage } from '@/pages/legal/PrivacyPage';
import { TermsPage } from '@/pages/legal/TermsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/tools', // public SEO tool pages — never bounce a logged-out visitor to login
  '/privacy',
  '/terms',
  '/waitlist',
];

export function App() {
  const ready = useBootstrapAuth();
  const navigate = useNavigate();
  const location = useLocation();
  usePageTracking();

  // Wired once so the api-client (which lives outside the React tree) can
  // send the user to /login after a hard auth failure (refresh also failed).
  // Skipped on already-public routes so a cold visit to e.g. /register isn't
  // hijacked by the background bootstrap probe's inevitable 401.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      // The landing page ('/') is public too — its bootstrap 401 must not bounce
      // a logged-out visitor to /login. Match it exactly (a prefix of '/' would
      // match every route).
      const isPublic =
        location.pathname === '/' ||
        PUBLIC_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
      if (!isPublic) {
        navigate('/login', { replace: true });
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, location.pathname]);

  if (!ready) {
    return <FullPageSpinner />;
  }

  return (
    <Routes>
      {/* Public marketing home — anyone can see it, logged in or not. */}
      <Route path="/" element={<LandingPage />} />

      {/* Public, SEO-facing free tools — no login required. */}
      <Route path="/tools" element={<ToolsHubPage />} />
      <Route path="/tools/:slug" element={<ToolDetailPage />} />

      {/* Legal (public) */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />

      {/* Waitlist is retired — signup is open. Old links/bookmarks land on
          registration rather than a 404. The page component is still in the
          repo if it ever needs bringing back. */}
      <Route path="/waitlist" element={<Navigate to="/register" replace />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Reachable regardless of auth state: verification links may be opened
          while logged out, and the page itself offers a logged-in resend action. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/instagram/accounts" element={<InstagramAccountsPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/workflows" element={<WorkflowsPage />} />
          <Route path="/workflows/:id" element={<WorkflowBuilderPage />} />
          <Route path="/content" element={<ContentPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/links" element={<LinksPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/help" element={<HelpCenterPage />} />
          {/* META_REDIRECT_URI points at exactly this path — do not rename. */}
          <Route path="/settings/instagram/callback" element={<InstagramCallbackPage />} />
          <Route path="/settings" element={<ProfilePage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/organization" element={<OrganizationPage />} />
        </Route>
      </Route>

      {/* Platform-owner back office — gated to User.isSuperAdmin (API-enforced too). */}
      <Route element={<SuperAdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminOverviewPage />} />
          <Route path="/admin/customers" element={<AdminCustomersPage />} />
          <Route path="/admin/customers/:id" element={<AdminCustomerDetailPage />} />
          <Route path="/admin/traffic" element={<AdminTrafficPage />} />
          <Route path="/admin/tickets" element={<AdminTicketsPage />} />
          <Route path="/admin/pricing" element={<AdminPricingPage />} />
          <Route path="/admin/coupons" element={<AdminCouponsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/audit" element={<AdminAuditPage />} />
        </Route>
      </Route>

      <Route path="/404" element={<NotFoundPage />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
