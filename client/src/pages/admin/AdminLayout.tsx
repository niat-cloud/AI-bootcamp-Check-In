import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import logo from '../../assets/niat-logo.png';
import { api, formatDate, type EventInfo } from '../../lib/api';

export interface AdminContext {
  event: EventInfo | null;
  reload: () => Promise<void>;
  selectEvent: (id: number | null) => void;
}

export const useAdmin = () => useOutletContext<AdminContext>();

const STORAGE_KEY = 'admin.selectedEventId';

const nav = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/setup', label: 'Event Setup' },
  { to: '/admin/import', label: 'Import Participants' },
  { to: '/admin/participants', label: 'Participants' },
  { to: '/admin/teams', label: 'Rooms & Teams' },
  { to: '/admin/export', label: 'Export' },
  { to: '/admin/events', label: 'All Events' },
];

export const statusBadge: Record<string, string> = {
  draft: 'bg-stone-200 text-niat-text',
  active: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-niat-pink text-niat-maroon',
};

export default function AdminLayout() {
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });

  const reload = useCallback(async () => {
    let e: EventInfo | null = null;
    if (selectedId) e = await api<EventInfo>(`/events/${selectedId}`).catch(() => null);
    if (!e) e = await api<EventInfo | null>('/events/current');
    setEvent(e);
    setLoaded(true);
  }, [selectedId]);

  useEffect(() => { reload(); }, [reload]);

  const selectEvent = (id: number | null) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, String(id));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable */ }
    setSelectedId(id);
  };

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-niat-line bg-white md:flex">
        <div className="border-b border-niat-line px-5 py-4">
          <img src={logo} alt="NIAT" className="h-8 w-auto" />
          <div className="eyebrow mt-3">AI Bootcamp Admin</div>
          {event ? (
            <div className="mt-2">
              <div className="truncate text-sm font-medium">{event.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-niat-muted">
                <span className={`rounded-full px-2 py-0.5 font-semibold capitalize ${statusBadge[event.status]}`}>{event.status}</span>
                {formatDate(event.date)}
              </div>
            </div>
          ) : loaded ? <div className="mt-1 text-sm text-niat-muted">No event yet</div> : null}
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-niat-cream font-semibold text-niat-maroon' : 'text-niat-muted hover:bg-niat-cream/50'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <NavLink to="/" className="btn-primary w-full">Open Check-in Screen →</NavLink>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex gap-2 overflow-x-auto border-b border-niat-line bg-white px-4 py-2 md:hidden">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-niat-cream text-niat-maroon' : 'text-niat-muted'}`}>
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-niat-maroon">Check-in →</NavLink>
        </div>
        <main className="mx-auto max-w-6xl p-4 sm:p-8">
          {loaded ? <Outlet context={{ event, reload, selectEvent } satisfies AdminContext} /> : <div className="text-niat-muted/70">Loading…</div>}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-niat-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function NoEvent() {
  return (
    <div className="card text-center">
      <p className="text-niat-muted">No event selected yet.</p>
      <NavLink to="/admin/setup" className="btn-primary mt-4">Create an event</NavLink>
    </div>
  );
}
