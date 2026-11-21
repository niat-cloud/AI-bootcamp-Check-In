import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { api, formatDate, type EventInfo, type LocationInfo } from '../../lib/api';
import { PageHeader, statusBadge, useAdmin } from './AdminLayout';
import { DateTile, EmptyState, Icons, Meter } from './kit';

const byDate = (a: EventInfo, b: EventInfo) => a.date.localeCompare(b.date);
const GROUPS: { status: EventInfo['status']; title: string; sort: (a: EventInfo, b: EventInfo) => number }[] = [
  { status: 'active', title: 'Live now', sort: byDate },
  { status: 'draft', title: 'Upcoming', sort: byDate },
  { status: 'completed', title: 'Completed', sort: (a, b) => byDate(b, a) },
];

export default function Events() {
  const { event: selected, selectEvent, reload } = useAdmin();
  const [events, setEvents] = useState<EventInfo[] | null>(null);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [locationId, setLocationId] = useState('');
  const navigate = useNavigate();

  const load = () => api<EventInfo[]>(`/events${locationId ? `?locationId=${locationId}` : ''}`).then(setEvents);
  useEffect(() => { load(); }, [locationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api<LocationInfo[]>('/platform/locations').then(setLocations).catch(() => {}); }, []);

  return (
    <div>
      <PageHeader title="All Events" subtitle="Every event has its own link, seating and attendance. Open one to manage it."
        actions={<button className="btn-primary" onClick={() => navigate('/admin/setup', { state: { create: true } })}>+ New Event</button>} />
      {locations.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <label htmlFor="event-location" className="text-sm font-semibold text-niat-muted">Location</label>
          <select id="event-location" className="input w-auto py-1.5" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
      {events === null ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-white shadow-[var(--shadow-card)]" />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState icon={Icons.calendar} title="No events yet"
          action={<button className="btn-primary" onClick={() => navigate('/admin/setup', { state: { create: true } })}>Create the first event</button>}>
          Each event gets its own check-in link, QR poster, rooms and teams.
        </EmptyState>
      ) : (
        <div className="space-y-7">
          {GROUPS.map((g) => {
            const list = events.filter((e) => e.status === g.status).sort(g.sort);
            if (!list.length) return null;
            return (
              <section key={g.status} aria-labelledby={`events-${g.status}`}>
                <h2 id={`events-${g.status}`} className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.12em] text-niat-muted">
                  {g.status === 'active' && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" /></span>}
                  {g.title}
                  <span className="rounded-full bg-stone-200/70 px-2 py-px text-[11px] tracking-normal text-niat-muted">{list.length}</span>
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {list.map((e) => {
                    const isSelected = selected?.id === e.id;
                    const people = e.participantCount ?? 0;
                    const seated = e.checkedInCount ?? 0;
                    return (
                      <article key={e.id}
                        className={`group flex flex-col rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-200 ${
                          isSelected ? 'border-niat-maroon/50 ring-2 ring-niat-maroon/15' : 'border-niat-line hover:border-niat-maroon/25 hover:shadow-[var(--shadow-soft)]'
                        }`}>
                        <div className="flex items-start gap-3.5">
                          <DateTile date={e.date} tone={e.status === 'active' ? 'live' : e.status === 'completed' ? 'muted' : 'default'} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="line-clamp-2 font-bold leading-snug text-niat-text">{e.name}</h3>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge[e.status]}`}>
                                {e.status === 'active' ? 'Live' : e.status}
                              </span>
                            </div>
                            <p className="mt-1 flex items-center gap-1 text-[13px] text-niat-muted">
                              <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{Icons.pin}</span>
                              {e.locationName ?? 'No location'}{e.time && <> · {e.time}</>}
                            </p>
                            {e.publicPath && (
                              <a href={e.publicPath} target="_blank" rel="noopener noreferrer"
                                className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-[11.5px] text-niat-muted hover:text-niat-maroon">
                                {Icons.link}<span className="truncate">{e.publicPath}</span>
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="mt-4">
                          <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
                            <span className="text-niat-muted">{e.status === 'draft' ? 'Registered' : 'Seated'}</span>
                            <span className="tabular-nums text-niat-muted">
                              {e.status === 'draft'
                                ? <><b className="text-niat-text">{people}</b> imported</>
                                : <><b className="text-niat-text">{seated}</b> / {people}</>}
                            </span>
                          </div>
                          <Meter value={e.status === 'draft' ? people : seated} max={e.status === 'draft' ? Math.max(people, e.expectedStudents || 0) : people}
                            label={`${seated} of ${people} seated`} tone={e.status === 'active' ? 'green' : 'maroon'} />
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2 border-t border-niat-line/70 pt-3">
                          {e.status === 'draft' ? (
                            <ConfirmButton className="cursor-pointer rounded-lg px-2 py-1 text-[13px] font-semibold text-niat-muted hover:bg-niat-pink hover:text-niat-maroon"
                              confirmText="Delete this draft?" onConfirm={async () => {
                                await api(`/events/${e.id}`, { method: 'DELETE' });
                                if (isSelected) selectEvent(null);
                                await load();
                                await reload();
                              }}>Delete draft</ConfirmButton>
                          ) : <span className="text-xs text-niat-muted">{formatDate(e.date)}</span>}
                          {isSelected
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-niat-pink px-2.5 py-1 text-xs font-bold text-niat-maroon">{Icons.check} Open now</span>
                            : <button className="btn-secondary py-1.5 text-sm group-hover:border-niat-maroon/30" onClick={() => { selectEvent(e.id); navigate('/admin'); }}>Open {Icons.arrow}</button>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
