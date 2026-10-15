import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatDate } from '../../lib/api';
import { PageHeader, statusBadge, useAdmin } from './AdminLayout';

interface OverviewEvent {
  id: number;
  name: string;
  date: string;
  time: string;
  status: 'draft' | 'active' | 'completed';
  slug: string | null;
  expectedStudents: number;
  locationId: number | null;
  locationName: string | null;
  locationSlug: string | null;
  registered: number;
  walkIns: number;
  seated: number;
  waiting: number;
  recent10Min: number;
  capacity: number;
}

interface OverviewLocation {
  id: number;
  name: string;
  city: string;
  state: string;
  slug: string;
  isActive: boolean;
  eventCount: number;
  totalSeated: number;
  uniqueStudents: number;
}

interface OverviewData {
  locations: OverviewLocation[];
  events: OverviewEvent[];
  pendingAdmins: number;
}

const REFRESH_MS = 20_000;

/** Every location at a glance: what's live right now, and how each location is doing over time. */
export default function Overview() {
  const { user, selectEvent } = useAdmin();
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(() => api<OverviewData>('/platform/overview')
    .then((d) => { setData(d); setError(null); setUpdatedAt(new Date()); })
    .catch((err) => setError((err as Error).message)), []);

  // Live numbers: refresh while the tab is visible.
  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const open = (eventId: number, to = '/admin') => {
    selectEvent(eventId);
    navigate(to);
  };

  const isSuper = user.role === 'super_admin';
  const title = isSuper ? 'All Locations' : user.locations.length > 1 ? 'My Locations' : user.locations[0]?.name ?? 'My Location';

  if (!data) {
    return (
      <div>
        <PageHeader title={title} />
        {error ? <div className="card text-niat-maroon" role="alert">{error}</div> : <div className="card text-niat-muted">Loading overview…</div>}
      </div>
    );
  }

  const live = data.events.filter((e) => e.status === 'active');
  const upcoming = data.events.filter((e) => e.status === 'draft').sort((a, b) => a.date.localeCompare(b.date));
  const recent = data.events.filter((e) => e.status === 'completed');
  const sum = (list: OverviewEvent[], key: keyof OverviewEvent) => list.reduce((s, e) => s + Number(e[key] || 0), 0);

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`Live numbers refresh every ${REFRESH_MS / 1000} seconds${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}`}
        actions={<button className="btn-secondary" onClick={load}>Refresh</button>}
      />

      {isSuper && data.pendingAdmins > 0 && (
        <Link to="/admin/admins" className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-niat-gold/50 bg-niat-cream px-4 py-3 text-sm font-semibold text-niat-text hover:border-niat-gold">
          <span>⏳ {data.pendingAdmins} admin access {data.pendingAdmins === 1 ? 'request is' : 'requests are'} waiting for your approval</span>
          <span className="text-niat-maroon">Review →</span>
        </Link>
      )}
      {error && <p className="mb-4 text-sm text-niat-maroon" role="alert">Couldn't refresh: {error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Live events" value={live.length} />
        <Stat label="Seated right now" value={sum(live, 'seated')} note={`of ${sum(live, 'capacity')} seats`} />
        <Stat label="Waiting for a seat" value={sum(live, 'waiting')} tone={sum(live, 'waiting') ? 'alert' : undefined} />
        <Stat label={isSuper ? 'Locations' : 'My locations'} value={data.locations.length} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">Live now</h2>
        {live.length === 0 ? (
          <div className="card text-sm text-niat-muted">No event is live at the moment.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {live.map((e) => <LiveCard key={e.id} event={e} onOpen={(to) => open(e.id, to)} />)}
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">Locations</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-niat-line bg-niat-warm-white text-niat-muted">
              <tr>
                <th className="px-4 py-3">Location</th><th className="px-3 text-right">Events</th>
                <th className="px-3 text-right">Students (unique)</th><th className="px-3 text-right">Seats given</th><th className="px-3">Next event</th>
              </tr>
            </thead>
            <tbody>
              {data.locations.map((l) => {
                const next = upcoming.find((e) => e.locationId === l.id) ?? live.find((e) => e.locationId === l.id);
                return (
                  <tr key={l.id} className="border-b border-niat-line/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{l.name}{!l.isActive && <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-niat-muted">Disabled</span>}</div>
                      <div className="text-xs text-niat-muted">{[l.city, l.state].filter(Boolean).join(', ')}</div>
                    </td>
                    <td className="px-3 text-right tabular-nums">{l.eventCount}</td>
                    <td className="px-3 text-right tabular-nums">{l.uniqueStudents}</td>
                    <td className="px-3 text-right tabular-nums">{l.totalSeated}</td>
                    <td className="px-3">
                      {next
                        ? <button className="cursor-pointer text-left font-medium text-niat-maroon hover:underline" onClick={() => open(next.id, '/admin/setup')}>{formatDate(next.date)}</button>
                        : <span className="text-niat-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
              {data.locations.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-niat-muted">
                  {isSuper ? <>No locations yet. <Link to="/admin/locations" className="font-semibold text-niat-maroon underline">Add the first one</Link>.</> : 'No locations are assigned to you yet.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <EventList title="Upcoming" events={upcoming} empty="No upcoming events." onOpen={(id) => open(id, '/admin/setup')} />
        <EventList title="Recently completed" events={recent} empty="No completed events in the last 90 days." onOpen={(id) => open(id)} showResults />
      </div>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: 'alert' }) {
  return (
    <div className={`card p-4 ${tone === 'alert' ? 'border-niat-maroon/30 bg-niat-pink/50' : ''}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-niat-muted">{label}</div>
      <div className={`mt-1 text-3xl font-black tabular-nums ${tone === 'alert' ? 'text-niat-maroon' : 'text-niat-text'}`}>{value}</div>
      {note && <div className="text-xs text-niat-muted">{note}</div>}
    </div>
  );
}

function LiveCard({ event: e, onOpen }: { event: OverviewEvent; onOpen: (to?: string) => void }) {
  const fill = e.capacity ? Math.min(100, Math.round((e.seated / e.capacity) * 100)) : 0;
  const free = Math.max(0, e.capacity - e.seated);
  const publicPath = e.locationSlug && e.slug ? `/${e.locationSlug}/${e.slug}` : null;
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-niat-maroon">📍 {e.locationName ?? 'No location'}</div>
          <div className="mt-0.5 truncate font-bold">{e.name}</div>
          <div className="text-xs text-niat-muted">{formatDate(e.date)}{e.time ? ` · ${e.time}` : ''}</div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-black uppercase text-emerald-700">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" /> Live
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span><strong className="text-2xl font-black tabular-nums">{e.seated}</strong> <span className="text-niat-muted">/ {e.capacity} seated</span></span>
          <span className="text-xs font-semibold text-niat-muted">{fill}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-niat-line/60" role="progressbar" aria-valuenow={fill} aria-valuemin={0} aria-valuemax={100} aria-label="Seats filled">
          <div className={`h-full rounded-full ${fill >= 95 ? 'bg-niat-maroon' : 'bg-emerald-600'}`} style={{ width: `${fill}%` }} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <Mini label="Free seats" value={free} />
        <Mini label="Walk-ins" value={e.walkIns} />
        <Mini label="Last 10 min" value={e.recent10Min} />
      </dl>
      {e.waiting > 0 && (
        <p className="mt-3 rounded-lg bg-niat-pink px-3 py-2 text-xs font-semibold text-niat-maroon-dark">
          {e.waiting} waiting for a seat. Add capacity in Rooms &amp; Teams.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <button className="btn-primary py-1.5 text-sm" onClick={() => onOpen('/admin')}>Dashboard</button>
        <button className="btn-secondary py-1.5 text-sm" onClick={() => onOpen('/admin/teams')}>Rooms</button>
        {publicPath && <a className="btn-secondary py-1.5 text-sm" href={publicPath} target="_blank" rel="noopener noreferrer">Student page ↗</a>}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse rounded-lg bg-niat-warm-white px-2 py-2 ring-1 ring-niat-line/70">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-niat-muted">{label}</dt>
      <dd className="text-lg font-black tabular-nums">{value}</dd>
    </div>
  );
}

function EventList({ title, events, empty, onOpen, showResults }: {
  title: string;
  events: OverviewEvent[];
  empty: string;
  onOpen: (id: number) => void;
  showResults?: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <div className="card divide-y divide-niat-line/60 p-0">
        {events.slice(0, 12).map((e) => (
          <button key={e.id} onClick={() => onOpen(e.id)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left hover:bg-niat-warm-white">
            <div className="min-w-0">
              <div className="truncate font-semibold">{e.name}</div>
              <div className="text-xs text-niat-muted">{e.locationName ?? '—'} · {formatDate(e.date)}</div>
            </div>
            {showResults
              ? <span className="shrink-0 text-right text-xs text-niat-muted"><strong className="text-sm text-niat-text tabular-nums">{e.seated}</strong> seated<br />{e.walkIns} walk-ins</span>
              : <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusBadge[e.status]}`}>{e.status}</span>}
          </button>
        ))}
        {events.length === 0 && <p className="px-4 py-6 text-center text-sm text-niat-muted">{empty}</p>}
      </div>
    </section>
  );
}
