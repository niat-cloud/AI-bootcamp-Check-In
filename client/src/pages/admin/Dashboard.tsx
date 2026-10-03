import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';

export interface DashboardData {
  stats: {
    expected: number; existing: number; walkIns: number; actual: number; checkedIn: number;
    remaining: number; remainingExpected: number; totalCapacity: number; seatsLeft: number;
  };
  rooms: { id: number; name: string; capacity: number; priority: number; used: number }[];
  teams: { id: number; teamNumber: number; capacity: number; roomId: number; assigned: number }[];
}

export function useDashboard(eventId: number | undefined, live: boolean) {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let stopped = false;
    const load = () => api<DashboardData>(`/events/${eventId}/dashboard`).then((d) => !stopped && setData(d)).catch(() => {});
    load();
    const timer = live ? setInterval(load, 5000) : undefined;
    return () => { stopped = true; clearInterval(timer); };
  }, [eventId, live]);
  return data;
}

export default function Dashboard() {
  const { event } = useAdmin();
  const data = useDashboard(event?.id, event?.status === 'active');
  if (!event) return <NoEvent />;

  return (
    <div>
      <PageHeader
        title={event.name}
        subtitle={`${formatDate(event.date)}${event.time ? ` · ${event.time}` : ''} · ${event.status === 'active' ? 'Live — updates every 5 seconds' : event.status}`}
        actions={event.status === 'draft' && <Link to="/admin/setup" className="btn-primary">Finish setup & activate</Link>}
      />
      {!data ? <div className="text-niat-muted/70">Loading…</div> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <Tile label="Expected" value={data.stats.expected} />
            <Tile label="Registered" value={data.stats.existing} />
            <Tile label="Walk-ins" value={data.stats.walkIns} accent="text-amber-600" />
            <Tile label="Actual participants" value={data.stats.actual} />
            <Tile label="Checked in" value={data.stats.checkedIn} accent="text-emerald-600" />
            <Tile label="Not yet arrived" value={data.stats.remaining} />
          </div>
          <p className="mt-2 text-sm text-niat-muted">
            {data.stats.seatsLeft} of {data.stats.totalCapacity} seats still free · {data.stats.remainingExpected} expected students not yet arrived
          </p>

          <div className="card mt-6">
            <h2 className="text-lg font-semibold">Room capacity</h2>
            <div className="mt-4 space-y-4">
              {data.rooms.map((r) => {
                const pct = r.capacity ? Math.round((r.used / r.capacity) * 100) : 0;
                return (
                  <div key={r.id}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{r.name} <span className="text-niat-muted/70">· priority {r.priority}</span></span>
                      <span className="font-mono">{r.used} / {r.capacity}</span>
                    </div>
                    <div className="mt-1 h-3 overflow-hidden rounded-full bg-niat-line/60">
                      <div className={`h-full rounded-full transition-[width] duration-500 ${pct >= 100 ? 'bg-emerald-600' : 'bg-gradient-to-r from-niat-maroon to-niat-gold'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {data.rooms.length === 0 && <p className="text-niat-muted">No rooms configured.</p>}
            </div>
          </div>

          <div className="card mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Team occupancy</h2>
              <Link to="/admin/teams" className="text-sm text-niat-maroon hover:underline">Seat-level view →</Link>
            </div>
            {data.teams.length === 0
              ? <p className="mt-3 text-niat-muted">Tables are created when the event is activated.</p>
              : <TeamGrid teams={data.teams} prefix={event.teamNamePrefix} />}
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-niat-muted">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function TeamGrid({ teams, prefix }: { teams: DashboardData['teams']; prefix: string }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-10">
      {teams.map((t) => {
        const full = t.assigned === t.capacity;
        const empty = t.assigned === 0;
        return (
          <div key={t.id} title={`${prefix} ${t.teamNumber}: ${t.assigned}/${t.capacity}`}
            className={`rounded-lg border px-2 py-1.5 text-center text-sm ${full ? 'border-emerald-300 bg-emerald-50' : empty ? 'border-niat-line bg-white text-niat-muted/70' : 'border-niat-maroon/40 bg-niat-cream'}`}>
            <div className="font-semibold">{t.teamNumber}</div>
            <div className="font-mono text-xs">{t.assigned}/{t.capacity}</div>
          </div>
        );
      })}
    </div>
  );
}
