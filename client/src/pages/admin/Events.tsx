import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { api, formatDate, type EventInfo, type LocationInfo } from '../../lib/api';
import { PageHeader, statusBadge, useAdmin } from './AdminLayout';

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
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-niat-line bg-niat-warm-white text-niat-muted">
            <tr>
              <th className="px-4 py-3">Event</th><th className="px-3">Location</th><th className="px-3">Date</th><th className="px-3">Status</th>
              <th className="px-3 text-right">Participants</th><th className="px-3 text-right">Seated</th><th className="px-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {events?.map((e) => (
              <tr key={e.id} className={`border-b border-niat-line/60 ${selected?.id === e.id ? 'bg-niat-cream/60' : ''}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.name}</div>
                  {e.publicPath && (
                    <a href={e.publicPath} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-niat-muted hover:text-niat-maroon hover:underline">
                      {e.publicPath}
                    </a>
                  )}
                </td>
                <td className="px-3">{e.locationName ?? <span className="text-niat-muted">—</span>}</td>
                <td className="whitespace-nowrap px-3">{formatDate(e.date)}</td>
                <td className="px-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusBadge[e.status]}`}>{e.status}</span></td>
                <td className="px-3 text-right tabular-nums">{e.participantCount}</td>
                <td className="px-3 text-right tabular-nums">{e.checkedInCount}</td>
                <td className="space-x-2 whitespace-nowrap px-3 text-right">
                  {selected?.id === e.id
                    ? <span className="text-xs font-semibold text-niat-maroon">Selected</span>
                    : <button className="btn-secondary py-1.5 text-sm" onClick={() => { selectEvent(e.id); navigate('/admin'); }}>Open</button>}
                  {e.status === 'draft' && (
                    <ConfirmButton className="btn-danger py-1.5 text-sm" confirmText="Delete this draft?" onConfirm={async () => {
                      await api(`/events/${e.id}`, { method: 'DELETE' });
                      if (selected?.id === e.id) selectEvent(null);
                      await load();
                      await reload();
                    }}>Delete</ConfirmButton>
                  )}
                </td>
              </tr>
            ))}
            {events === null && <tr><td colSpan={7} className="px-4 py-8 text-center text-niat-muted">Loading events…</td></tr>}
            {events?.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-niat-muted">No events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
