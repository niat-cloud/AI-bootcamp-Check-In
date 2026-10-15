import { useEffect, useState } from 'react';
import { api, formatTime } from '../../../lib/api';
import type { OverviewRoom, OverviewTeam } from './types';

interface Row {
  id: number;
  name: string;
  phone: string;
  schoolCollege: string;
  status: 'registered' | 'waiting' | 'checked_in';
  roomId: number | null;
  room: string | null;
  teamNumber: number | null;
  seatLabel: string | null;
  checkInTime: string | null;
  arrivedAt: string | null;
}

export interface Filters {
  q: string;
  roomId: number | 'all';
  team: number | 'all';
  status: 'all' | 'checked_in' | 'waiting' | 'pending';
}

export const emptyFilters: Filters = { q: '', roomId: 'all', team: 'all', status: 'all' };
export const filtersActive = (f: Filters) => f.q.trim() !== '' || f.team !== 'all' || f.status !== 'all';

const STATUS_LABEL: Record<Row['status'], { text: string; cls: string }> = {
  checked_in: { text: '✓ Seated', cls: 'bg-emerald-100 text-emerald-800' },
  waiting: { text: '⏳ Awaiting seat', cls: 'bg-niat-pink text-niat-maroon' },
  registered: { text: '○ Not arrived', cls: 'bg-stone-100 text-niat-muted' },
};

/** Search controls. Room selection is shared with the room navigation. */
export function SearchBar({ filters, onChange, rooms, teams }: {
  filters: Filters;
  onChange: (f: Filters) => void;
  rooms: OverviewRoom[];
  teams: OverviewTeam[];
}) {
  const teamNumbers = filters.roomId === 'all'
    ? []
    : teams.filter((t) => t.roomId === filters.roomId).map((t) => t.teamNumber);

  return (
    <div className="mt-6 flex flex-wrap items-end gap-2" role="search">
      <label className="min-w-[220px] flex-1">
        <span className="sr-only">Search students</span>
        <input className="input py-2.5" placeholder="Search name or phone…" value={filters.q} autoComplete="off"
          onChange={(e) => onChange({ ...filters, q: e.target.value })} />
      </label>
      <Select label="Room" value={String(filters.roomId)}
        onChange={(v) => onChange({ ...filters, roomId: v === 'all' ? 'all' : Number(v), team: 'all' })}
        options={[['all', 'All rooms'], ...rooms.map((r) => [String(r.id), r.name] as [string, string])]} />
      <Select label="Team" value={String(filters.team)} disabled={filters.roomId === 'all'}
        title={filters.roomId === 'all' ? 'Pick a room first: team numbers restart in every room' : undefined}
        onChange={(v) => onChange({ ...filters, team: v === 'all' ? 'all' : Number(v) })}
        options={[['all', filters.roomId === 'all' ? 'Pick a room' : 'All teams'], ...teamNumbers.map((n) => [String(n), `Team ${n}`] as [string, string])]} />
      <Select label="Status" value={filters.status}
        onChange={(v) => onChange({ ...filters, status: v as Filters['status'] })}
        options={[['all', 'Any status'], ['checked_in', 'Seated'], ['waiting', 'Awaiting seat'], ['pending', 'Not arrived']]} />
      {(filtersActive(filters) || filters.roomId !== 'all') && (
        <button className="btn-secondary py-2.5" onClick={() => onChange(emptyFilters)}>Clear</button>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, disabled, title }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className="w-[calc(50%-4px)] sm:w-40" title={title}>
      <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-niat-muted">{label}</span>
      <select className="input py-2.5" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/** Matching students with their room, team and seat. */
export function SearchResults({ eventId, filters, prefix, refreshKey, onLocate }: {
  eventId: number;
  filters: Filters;
  prefix: string;
  refreshKey: number;
  onLocate: (row: { roomId: number; eventParticipantId: number }) => void;
}) {
  const [data, setData] = useState<{ total: number; rows: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ q: filters.q.trim(), filter: filters.status });
    if (filters.roomId !== 'all') params.set('roomId', String(filters.roomId));
    if (filters.team !== 'all') params.set('team', String(filters.team));
    const timer = setTimeout(() => {
      api<{ total: number; rows: Row[] }>(`/events/${eventId}/participants?${params}`, { signal: controller.signal })
        .then((d) => { setData(d); setError(null); })
        .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [eventId, filters, refreshKey]);

  if (error) return <p className="mt-4 rounded-xl bg-niat-pink px-4 py-3 text-sm text-niat-maroon-dark" role="alert">Search failed: {error}</p>;
  if (!data) return <p className="mt-4 text-sm text-niat-muted">Searching…</p>;

  return (
    <section aria-label="Search results" className="mt-4 overflow-hidden rounded-2xl border border-niat-line bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-niat-line px-4 py-2.5 text-sm">
        <span className="font-bold">{data.total.toLocaleString('en-IN')} {data.total === 1 ? 'student' : 'students'}</span>
        {data.total > data.rows.length && <span className="text-xs text-niat-muted">Showing first {data.rows.length}</span>}
      </div>
      {data.rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-niat-muted">No students match these filters.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-niat-warm-white text-xs uppercase tracking-wide text-niat-muted">
              <tr>
                <th className="px-4 py-2 font-bold">Student</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Room</th>
                <th className="px-3 py-2 font-bold">Team</th>
                <th className="px-3 py-2 font-bold">Seat</th>
                <th className="px-3 py-2 font-bold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-niat-line/60">
              {data.rows.map((r) => {
                const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.registered;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="max-w-[240px] px-4 py-2">
                      <span className="block truncate font-semibold" title={r.name}>{r.name}</span>
                      <span className="block truncate text-xs text-niat-muted" title={r.schoolCollege}>{r.schoolCollege} · {r.phone}</span>
                    </td>
                    <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>{st.text}</span></td>
                    <td className="whitespace-nowrap px-3 py-2">{r.room ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.teamNumber ? `${prefix} ${r.teamNumber}` : '—'}</td>
                    <td className="px-3 py-2">
                      {r.teamNumber && r.roomId ? (
                        <button className="font-mono font-bold text-niat-maroon underline-offset-2 hover:underline"
                          onClick={() => onLocate({ roomId: r.roomId!, eventParticipantId: r.id })}
                          title={`Show ${r.room} ${prefix} ${r.teamNumber}`}>
                          {r.teamNumber}{r.seatLabel}
                        </button>
                      ) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-niat-muted">{formatTime(r.checkInTime ?? r.arrivedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
