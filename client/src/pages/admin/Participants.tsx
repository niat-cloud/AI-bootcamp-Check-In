import { useEffect, useState } from 'react';
import { api, formatTime } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';

interface ParticipantRow {
  id: number;
  name: string;
  phone: string;
  parentPhone: string | null;
  schoolCollege: string;
  className: string | null;
  location: string | null;
  registrationType: 'existing' | 'walk_in';
  room: string | null;
  teamNumber: number | null;
  seatLabel: string | null;
  checkInTime: string | null;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'checked_in', label: 'Checked in' },
  { key: 'pending', label: 'Not arrived' },
  { key: 'walk_in', label: 'Walk-ins' },
];

export default function Participants() {
  const { event } = useAdmin();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<{ total: number; rows: ParticipantRow[] } | null>(null);

  useEffect(() => {
    if (!event) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(`/events/${event.id}/participants?q=${encodeURIComponent(q.trim())}&filter=${filter}`, { signal: controller.signal })
        .then(setData).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [event, q, filter]);

  if (!event) return <NoEvent />;

  return (
    <div>
      <PageHeader title="Participants" subtitle="Search by name, phone, school, location, team (“17”) or seat (“17B”)." />
      <div className="flex flex-wrap gap-3">
        <input className="input max-w-md py-3 text-lg" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="flex rounded-xl border border-niat-line bg-white p-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f.key ? 'bg-niat-maroon text-white' : 'text-niat-muted hover:bg-niat-cream/50'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-niat-line bg-niat-warm-white text-niat-muted">
            <tr>
              <th className="px-4 py-3">Name</th><th className="px-3">Phone</th><th className="px-3">School/College</th>
              <th className="px-3">Coming From</th>
              <th className="px-3">Type</th><th className="px-3">Room</th><th className="px-3">Team</th><th className="px-3">Seat</th><th className="px-3">Check-in</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-niat-line/60">
                <td className="px-4 py-2.5 font-medium">{r.name}{r.className && <span className="ml-1 text-xs text-niat-muted/70">({r.className})</span>}</td>
                <td className="px-3 font-mono">{r.phone}</td>
                <td className="px-3">{r.schoolCollege}</td>
                <td className="px-3">
                  {r.location
                    ? <span className="inline-flex items-center rounded-md bg-niat-cream px-2 py-0.5 text-xs font-semibold text-niat-maroon ring-1 ring-niat-gold/40">{r.location}</span>
                    : <span className="text-niat-muted/40">—</span>}
                </td>
                <td className="px-3">
                  {r.registrationType === 'walk_in'
                    ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Walk-in</span>
                    : <span className="text-niat-muted">Existing</span>}
                </td>
                <td className="px-3">{r.room ?? ''}</td>
                <td className="px-3">{r.teamNumber ? `${event.teamNamePrefix} ${r.teamNumber}` : ''}</td>
                <td className="px-3 font-bold">{r.teamNumber ? `${r.teamNumber}${r.seatLabel}` : ''}</td>
                <td className="px-3">
                  {r.checkInTime
                    ? <span className="text-emerald-700">{formatTime(r.checkInTime)}</span>
                    : <span className="text-niat-muted/70">Not arrived</span>}
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-niat-muted">No participants match.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <p className="mt-2 text-sm text-niat-muted">Showing {data.rows.length} of {data.total}</p>}
    </div>
  );
}
