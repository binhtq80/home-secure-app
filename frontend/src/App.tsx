import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConfirmPage } from './pages/ConfirmPage';
import { DashboardPage } from './pages/DashboardPage';
import { DevicesPage } from './pages/DevicesPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SubmitFeaturePage } from './pages/SubmitFeaturePage';
import { FeatureDetailPage } from './pages/FeatureDetailPage';
import { FeatureRequestSummaryPage } from './pages/FeatureRequestSummaryPage';
import './App.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/confirm" element={<PublicRoute><ConfirmPage /></PublicRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/devices" element={<ProtectedRoute><DevicesPage /></ProtectedRoute>} />
      <Route path="/devices/:deviceId" element={<ProtectedRoute><DeviceDetailPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/submit-feature" element={<ProtectedRoute><SubmitFeaturePage /></ProtectedRoute>} />
      <Route path="/submit-feature/:featureId" element={<ProtectedRoute><FeatureDetailPage /></ProtectedRoute>} />
      <Route path="/feature-summary" element={<ProtectedRoute><FeatureRequestSummaryPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="app">
            <AppRoutes />
            <footer className="app-footer">
              MyApp v1.0 — Powered by AWS
            </footer>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
