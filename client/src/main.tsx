import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import CheckIn from './pages/checkin/CheckIn';
import AdminLayout from './pages/admin/AdminLayout';

// Admin pages load on demand so the check-in screen stays small and fast.
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
          <Route path="/" element={<CheckIn />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="setup" element={<EventSetup />} />
            <Route path="import" element={<Import />} />
            <Route path="participants" element={<Participants />} />
            <Route path="teams" element={<Teams />} />
            <Route path="export" element={<Export />} />
            <Route path="events" element={<Events />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
