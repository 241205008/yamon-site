import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RequireAdmin, RequireAuth } from './components/RouteGuards';
import { AdminPage } from './pages/AdminPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventListPage } from './pages/EventListPage';
import { LocationsPage } from './pages/LocationsPage';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { MapPage } from './pages/MapPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages';
import { PrivacyPage } from './pages/PrivacyPage';
import { SetupPage } from './pages/SetupPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<MainPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/locations" element={<LocationsPage />} />
          <Route path="/event-list" element={<EventListPage />} />
          <Route path="/event-detail/:eventId" element={<EventDetailPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
