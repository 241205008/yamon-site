import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RequireAdmin, RequireAuth } from './components/RouteGuards';
import { AdminPage } from './pages/AdminPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventListPage } from './pages/EventListPage';
import { LocationsPage } from './pages/LocationsPage';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { MapPage } from './pages/MapPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
