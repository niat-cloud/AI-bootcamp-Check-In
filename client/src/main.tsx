import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import EventCheckIn from './pages/checkin/EventCheckIn';
import Home from './pages/checkin/Home';

// Admin pages and the gate kiosk load on demand so the student pages stay small and fast.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Signup = lazy(() => import('./pages/admin/Signup'));
const CheckIn = lazy(() => import('./pages/checkin/CheckIn'));
const Overview = lazy(() => import('./pages/admin/Overview'));
const Locations = lazy(() => import('./pages/admin/Locations'));
const Admins = lazy(() => import('./pages/admin/Admins'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const EventSetup = lazy(() => import('./pages/admin/EventSetup'));
const Events = lazy(() => import('./pages/admin/Events'));
const Import = lazy(() => import('./pages/admin/Import'));
const Participants = lazy(() => import('./pages/admin/Participants'));
const Teams = lazy(() => import('./pages/admin/Teams'));
const Export = lazy(() => import('./pages/admin/Export'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<div className="p-8 text-slate-400">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/signup" element={<Signup />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="overview" element={<Overview />} />
            <Route path="locations" element={<Locations />} />
            <Route path="admins" element={<Admins />} />
            <Route path="setup" element={<EventSetup />} />
            <Route path="import" element={<Import />} />
            <Route path="participants" element={<Participants />} />
            <Route path="teams" element={<Teams />} />
            <Route path="export" element={<Export />} />
            <Route path="events" element={<Events />} />
          </Route>
          <Route path="/gate/:eventId" element={<CheckIn />} />
          {/* Public event page from the QR code, e.g. /hyderabad/18-oct-2026 */}
          <Route path="/:location/:slug" element={<EventCheckIn />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
