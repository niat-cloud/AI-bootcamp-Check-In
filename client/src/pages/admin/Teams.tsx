import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useDashboard } from './Dashboard';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';

interface TeamDetail {
  id: number;
  teamNumber: number;
  capacity: number;
  roomId: number;
  room: string;
  seats: { label: string; student: string | null }[];
}

export default function Teams() {
  const { event } = useAdmin();
  const live = event?.status === 'active';
  const dashboard = useDashboard(event?.id, live);
  const [teams, setTeams] = useState<TeamDetail[]>([]);

  useEffect(() => {
    if (!event) return;
    const load = () => api<TeamDetail[]>(`/events/${event.id}/teams`).then(setTeams).catch(() => {});
    load();
    const timer = live ? setInterval(load, 5000) : undefined;
    return () => clearInterval(timer);
  }, [event, live]);

  if (!event) return <NoEvent />;

  return (
    <div>
      <PageHeader title="Rooms & Teams" subtitle="Each team is one physical table. Seats fill as students check in." />
      {teams.length === 0 && <div className="card text-niat-muted">Tables are created when the event is activated.</div>}
      {dashboard?.rooms.map((room) => {
        const roomTeams = teams.filter((t) => t.roomId === room.id);
        if (!roomTeams.length) return null;
        return (
          <section key={room.id} className="mb-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">{room.name}</h2>
              <span className="font-mono text-niat-muted">{room.used} / {room.capacity} seated</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {roomTeams.map((t) => {
                const filled = t.seats.filter((s) => s.student).length;
                return (
                  <div key={t.id} className={`rounded-xl border bg-white p-3 ${filled === t.capacity ? 'border-emerald-300' : filled ? 'border-niat-maroon/25' : 'border-niat-line'}`}>
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{event.teamNamePrefix} {t.teamNumber}</span>
                      <span className="font-mono text-niat-muted">{filled}/{t.capacity}</span>
                    </div>
                    <ul className="mt-2 space-y-1 text-sm">
                      {t.seats.map((s) => (
                        <li key={s.label} className="flex gap-2">
                          <span className="w-9 shrink-0 font-mono text-niat-muted/70">{t.teamNumber}{s.label}</span>
                          <span className={`truncate ${s.student ? '' : 'text-niat-line'}`}>{s.student ?? 'empty'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
