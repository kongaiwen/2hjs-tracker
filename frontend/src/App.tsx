import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import MainLayout from '@/components/layout/MainLayout';
import { KeySetupPage } from '@/components/auth/KeySetupPage';
import DashboardPage from '@/pages/DashboardPage';
import LAMPPage from '@/pages/LAMPPage';
import ContactsPage from '@/pages/ContactsPage';
import OutreachPage from '@/pages/OutreachPage';
import TemplatesPage from '@/pages/TemplatesPage';
import CalendarPage from '@/pages/CalendarPage';
import SettingsPage from '@/pages/SettingsPage';
import AboutPage from '@/pages/AboutPage';
import BulkUploadPage from '@/pages/BulkUploadPage';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

// Protected Route wrapper
function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Cloudflare Access will handle authentication
    // Just show a loading state while redirect happens
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Authenticating...</div>
      </div>
    );
  }

  if (requireAdmin && user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      {/* Key setup route */}
      <Route path="/setup-keys" element={
        <ProtectedRoute>
          <KeySetupPage />
        </ProtectedRoute>
      } />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Outlet />
            </MainLayout>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="lamp" element={<LAMPPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="outreach" element={<OutreachPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="bulk" element={<BulkUploadPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="admin" element={
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        } />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
