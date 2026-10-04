import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { AppDialogHost } from './components/AppDialog';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import { AdminLayout } from './layouts/AdminLayout';
import { CategoriesPage } from './pages/CategoriesPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { CourseFormPage } from './pages/CourseFormPage';
import { CourseOrdersPage } from './pages/CourseOrdersPage';
import { CoursesPage } from './pages/CoursesPage';
import { CustomersPage } from './pages/CustomersPage';
import { DashboardPage } from './pages/DashboardPage';
import { LiveBookingDetailPage } from './pages/LiveBookingDetailPage';
import { LiveBookingsPage } from './pages/LiveBookingsPage';
import { LiveSettingsPage } from './pages/LiveSettingsPage';
import { LiveClassBookingsPage } from './pages/LiveClassBookingsPage';
import { LoginPage } from './pages/LoginPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { ProductImportPage } from './pages/ProductImportPage';
import { ProductsPage } from './pages/ProductsPage';
import { SpecialOffersPage } from './pages/SpecialOffersPage';
import { StudentOffersPage } from './pages/StudentOffersPage';
import { ViralProjectsPage } from './pages/ViralProjectsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SupportPage } from './pages/SupportPage';
import { AppHealthPage } from './pages/AppHealthPage';
import { PhoneOtpsPage } from './pages/PhoneOtpsPage';
import { IntroVideoPage } from './pages/IntroVideoPage';
import { AccountPage } from './pages/AccountPage';
import { DeleteAccountPage } from './pages/DeleteAccountPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TeamUsersPage } from './pages/TeamUsersPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
              <Route path="app-health" element={<AppHealthPage />} />
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
        <AppDialogHost />
      </AuthProvider>
    </BrowserRouter>
  );
}
