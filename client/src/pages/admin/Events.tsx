import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { api, formatDate, type EventInfo } from '../../lib/api';
import { PageHeader, statusBadge, useAdmin } from './AdminLayout';

export default function Events() {
  const { event: selected, selectEvent, reload } = useAdmin();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const navigate = useNavigate();

  const load = () => api<EventInfo[]>('/events').then(setEvents);
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="All Events" subtitle="Every event has its own seating and attendance. Open one to view its dashboard or export."
        actions={<button className="btn-primary" onClick={() => navigate('/admin/setup', { state: { create: true } })}>+ New Event</button>} />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-niat-line bg-niat-warm-white text-niat-muted">
            <tr><th className="px-4 py-3">Event</th><th className="px-3">Date</th><th className="px-3">Status</th><th className="px-3">Participants</th><th className="px-3">Checked in</th><th className="px-3" /></tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className={`border-b border-niat-line/60 ${selected?.id === e.id ? 'bg-niat-cream/60' : ''}`}>
                <td className="px-4 py-3 font-medium">{e.name}</td>
                <td className="px-3">{formatDate(e.date)}</td>
                <td className="px-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusBadge[e.status]}`}>{e.status}</span></td>
                <td className="px-3">{e.participantCount}</td>
                <td className="px-3">{e.checkedInCount}</td>
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
            {events.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-niat-muted">No events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
