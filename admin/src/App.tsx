import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppDialogHost } from './components/AppDialog';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import { AdminLayout } from './layouts/AdminLayout';
import { LoginPage } from './pages/LoginPage';

// Each page is its own file, downloaded when first opened.
const CategoriesPage = lazy(() => import('./pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })));
const CourseDetailPage = lazy(() => import('./pages/CourseDetailPage').then((m) => ({ default: m.CourseDetailPage })));
const CourseFormPage = lazy(() => import('./pages/CourseFormPage').then((m) => ({ default: m.CourseFormPage })));
const CourseOrdersPage = lazy(() => import('./pages/CourseOrdersPage').then((m) => ({ default: m.CourseOrdersPage })));
const CoursesPage = lazy(() => import('./pages/CoursesPage').then((m) => ({ default: m.CoursesPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const LiveBookingDetailPage = lazy(() => import('./pages/LiveBookingDetailPage').then((m) => ({ default: m.LiveBookingDetailPage })));
const LiveBookingsPage = lazy(() => import('./pages/LiveBookingsPage').then((m) => ({ default: m.LiveBookingsPage })));
const LiveCoursesPage = lazy(() => import('./pages/LiveCoursesPage').then((m) => ({ default: m.LiveCoursesPage })));
const LiveEnquiriesPage = lazy(() => import('./pages/LiveEnquiriesPage').then((m) => ({ default: m.LiveEnquiriesPage })));
const LiveSettingsPage = lazy(() => import('./pages/LiveSettingsPage').then((m) => ({ default: m.LiveSettingsPage })));
const LiveClassBookingsPage = lazy(() => import('./pages/LiveClassBookingsPage').then((m) => ({ default: m.LiveClassBookingsPage })));
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then((m) => ({ default: m.PaymentsPage })));
const ProductFormPage = lazy(() => import('./pages/ProductFormPage').then((m) => ({ default: m.ProductFormPage })));
const ProductImportPage = lazy(() => import('./pages/ProductImportPage').then((m) => ({ default: m.ProductImportPage })));
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })));
const SpecialOffersPage = lazy(() => import('./pages/SpecialOffersPage').then((m) => ({ default: m.SpecialOffersPage })));
const StudentOffersPage = lazy(() => import('./pages/StudentOffersPage').then((m) => ({ default: m.StudentOffersPage })));
const ViralProjectsPage = lazy(() => import('./pages/ViralProjectsPage').then((m) => ({ default: m.ViralProjectsPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SupportPage = lazy(() => import('./pages/SupportPage').then((m) => ({ default: m.SupportPage })));
const AppHealthPage = lazy(() => import('./pages/AppHealthPage').then((m) => ({ default: m.AppHealthPage })));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage').then((m) => ({ default: m.FeedbackPage })));
const BackendCheckPage = lazy(() => import('./pages/BackendCheckPage').then((m) => ({ default: m.BackendCheckPage })));
const PhoneOtpsPage = lazy(() => import('./pages/PhoneOtpsPage').then((m) => ({ default: m.PhoneOtpsPage })));
const UserMetricsPage = lazy(() => import('./pages/UserMetricsPage').then((m) => ({ default: m.UserMetricsPage })));
const IntroVideoPage = lazy(() => import('./pages/IntroVideoPage').then((m) => ({ default: m.IntroVideoPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const DeleteAccountPage = lazy(() => import('./pages/DeleteAccountPage').then((m) => ({ default: m.DeleteAccountPage })));
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })));
const TeamUsersPage = lazy(() => import('./pages/TeamUsersPage').then((m) => ({ default: m.TeamUsersPage })));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<div className="page-loading" role="status">Loading…</div>}>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/delete-account" element={<DeleteAccountPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="course-orders" element={<CourseOrdersPage />} />
              <Route path="live-bookings" element={<LiveClassBookingsPage />} />
              <Route path="live" element={<LiveBookingsPage />} />
              <Route path="live/settings" element={<LiveSettingsPage />} />
              <Route path="live/courses" element={<LiveCoursesPage />} />
              <Route path="live/enquiries" element={<LiveEnquiriesPage />} />
              <Route path="live/bookings/:id" element={<LiveBookingDetailPage />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="courses/new" element={<CourseFormPage />} />
              <Route path="courses/:id" element={<CourseDetailPage />} />
              <Route path="courses/:id/edit" element={<CourseFormPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="special-offers" element={<SpecialOffersPage />} />
              <Route path="special-offers/students" element={<StudentOffersPage />} />
              <Route path="intro-video" element={<IntroVideoPage />} />
              <Route path="viral-projects" element={<ViralProjectsPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="customers"element={<CustomersPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="phone-otps" element={<PhoneOtpsPage />} />
              <Route path="user-metrics" element={<UserMetricsPage />} />
              <Route path="app-health" element={<AppHealthPage />} />
              <Route path="feedback" element={<FeedbackPage />} />
              <Route path="backend-check" element={<BackendCheckPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/import" element={<ProductImportPage />} />
              <Route path="products/new" element={<ProductFormPage />} />
              <Route path="products/:id/edit" element={<ProductFormPage />} />
              <Route path="account" element={<AccountPage />} />
              <Route path="team" element={<TeamUsersPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <AppDialogHost />
      </AuthProvider>
    </BrowserRouter>
  );
}
