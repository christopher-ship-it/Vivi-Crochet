import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import { AdminLayout } from './layouts/AdminLayout';
import { CategoriesPage } from './pages/CategoriesPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { CourseFormPage } from './pages/CourseFormPage';
import { CoursesPage } from './pages/CoursesPage';
import { DashboardPage } from './pages/DashboardPage';
import { LiveBookingDetailPage } from './pages/LiveBookingDetailPage';
import { LiveBookingsPage } from './pages/LiveBookingsPage';
import { LiveWeeksPage } from './pages/LiveWeeksPage';
import { LoginPage } from './pages/LoginPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProductFormPage } from './pages/ProductFormPage';
import { ProductsPage } from './pages/ProductsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="live" element={<LiveBookingsPage />} />
              <Route path="live/bookings/:id" element={<LiveBookingDetailPage />} />
              <Route path="live/weeks" element={<LiveWeeksPage />} />
              <Route path="courses" element={<CoursesPage />} />
              <Route path="courses/new" element={<CourseFormPage />} />
              <Route path="courses/:id" element={<CourseDetailPage />} />
              <Route path="courses/:id/edit" element={<CourseFormPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="products/new" element={<ProductFormPage />} />
              <Route path="products/:id/edit" element={<ProductFormPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
