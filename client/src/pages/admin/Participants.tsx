import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { api, formatTime, type ApiError } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';

interface ParticipantRow {
  id: number;
  name: string;
  phone: string;
  parentPhone: string | null;
  schoolCollege: string;
  className: string | null;
  location: string | null;
  source: string | null;
  registrationType: 'existing' | 'walk_in';
  status: 'registered' | 'waiting' | 'checked_in';
  room: string | null;
  teamNumber: number | null;
  seatLabel: string | null;
  checkInTime: string | null;
}

/** Only people who haven't arrived can be removed; anyone checked in or waiting keeps their place. */
const removable = (r: ParticipantRow) => !r.checkInTime && r.status === 'registered';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'checked_in', label: 'Checked in' },
  { key: 'pending', label: 'Not arrived' },
  { key: 'waiting', label: 'Waiting for a seat' },
  { key: 'walk_in', label: 'Walk-ins' },
];

export default function Participants() {
  const { event } = useAdmin();
  const [q, setQ] = useState('');
  // The dashboard links here with ?filter=checked_in and the like.
  const [params] = useSearchParams();
  const [filter, setFilter] = useState(() => {
    const initial = params.get('filter');
    return FILTERS.some((f) => f.key === initial) ? initial! : 'all';
  });
  const [data, setData] = useState<{ total: number; rows: ParticipantRow[] } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!event) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api(`/events/${event.id}/participants?q=${encodeURIComponent(q.trim())}&filter=${filter}`, { signal: controller.signal })
        .then(setData).catch(() => {});
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [event, q, filter, reloadKey]);

  // A new search or filter starts a new selection.
  useEffect(() => setSelected(new Set()), [q, filter]);

  const remove = useCallback(async (body: object) => {
    if (!event) return;
    try {
      const r = await api<{ removed: number; kept: number; freedSeats: number }>(`/events/${event.id}/participants/remove`, { body });
      setToast({
        tone: 'ok',
        text: `Removed ${r.removed} ${r.removed === 1 ? 'registration' : 'registrations'} from this event.`
          + (r.freedSeats ? ` ${r.freedSeats} ${r.freedSeats === 1 ? 'seat' : 'seats'} freed.` : '')
          + (r.kept ? ` Kept ${r.kept} who already arrived.` : ''),
      });
      setSelected(new Set());
      setReloadKey((k) => k + 1);
    } catch (err) {
      setToast({ tone: 'error', text: (err as ApiError).message });
    }
  }, [event]);

  if (!event) return <NoEvent />;

  const shownRemovable = data?.rows ?? [];
  const selectedArrived = (data?.rows ?? []).filter((r) => selected.has(r.id) && !removable(r)).length;
  const allShownSelected = shownRemovable.length > 0 && shownRemovable.every((r) => selected.has(r.id));
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const searching = Boolean(q.trim()) || filter !== 'all';
  const canEdit = event.status !== 'completed';

  return (
    <div>
      <PageHeader title="Participants" subtitle="Search by name, phone, school, location, source, team (“17”) or seat (“17B”)." />
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

      {toast && (
        <div role="status" className={`mt-4 flex justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium ${toast.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-niat-pink text-niat-maroon-dark'}`}>
          <span>{toast.tone === 'ok' ? '✓ ' : '⚠ '}{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {canEdit && data && data.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-niat-line bg-white px-4 py-3 text-sm">
          <span className="mr-auto text-niat-muted">
            Imported the wrong list? Tick the people to remove from this event, or search for them first (for example by school or source).
            Removing by search keeps anyone who has arrived; tick a seated person to remove them and free the seat.
          </span>
          {selected.size > 0 && (
            <ConfirmButton className="btn-danger py-1.5 text-sm"
              confirmText={`Remove ${selected.size} ${selected.size === 1 ? 'person' : 'people'} from this event?`
                + (selectedArrived ? ` ${selectedArrived} already arrived: their seats will be freed.` : '')}
              onConfirm={() => remove({ ids: [...selected], includeArrived: selectedArrived > 0 })}>
              Remove {selected.size} selected
            </ConfirmButton>
          )}
          {searching && selected.size === 0 && (
            <ConfirmButton className="btn-danger py-1.5 text-sm"
              confirmText={`Remove everyone matching this search who hasn’t arrived (up to ${data.total}) from this event?`}
              onConfirm={() => remove({ matching: { q: q.trim(), filter } })}>
              Remove all {data.total} matching
            </ConfirmButton>
          )}
        </div>
      )}

      <div className="card mt-4 overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-niat-line bg-niat-warm-white text-niat-muted">
            <tr>
              {canEdit && (
                <th className="w-10 pl-4">
                  <input type="checkbox" aria-label="Select everyone shown" className="h-4 w-4 accent-niat-maroon"
                    checked={allShownSelected} disabled={!shownRemovable.length}
                    onChange={() => setSelected(allShownSelected ? new Set() : new Set(shownRemovable.map((r) => r.id)))} />
                </th>
              )}
              <th className="px-4 py-3">Name</th><th className="px-3">Phone</th><th className="px-3">School/College</th>
              <th className="px-3">Coming From</th><th className="px-3">Source</th>
              <th className="px-3">Type</th><th className="px-3">Room</th><th className="px-3">Team</th><th className="px-3">Seat</th><th className="px-3">Check-in</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} className={`border-b border-niat-line/60 ${selected.has(r.id) ? 'bg-niat-pink/60' : ''}`}>
                {canEdit && (
                  <td className="pl-4">
                    <input type="checkbox" className="h-4 w-4 accent-niat-maroon" aria-label={`Select ${r.name}`}
                      checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                      title={removable(r) ? undefined : 'Already arrived: removing frees their seat'} />
                  </td>
                )}
                <td className="px-4 py-2.5 font-medium">{r.name}{r.className && <span className="ml-1 text-xs text-niat-muted/70">({r.className})</span>}</td>
                <td className="px-3 font-mono">{r.phone}</td>
                <td className="px-3">{r.schoolCollege}</td>
                <td className="px-3">
                  {r.location
                    ? <span className="inline-flex items-center rounded-md bg-niat-cream px-2 py-0.5 text-xs font-semibold text-niat-maroon ring-1 ring-niat-gold/40">{r.location}</span>
                    : <span className="text-niat-muted/40">—</span>}
                </td>
                <td className="px-3">{r.source ?? <span className="text-niat-muted/40">—</span>}</td>
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
            {data && data.rows.length === 0 && <tr><td colSpan={11} className="px-4 py-8 text-center text-niat-muted">No participants match.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <p className="mt-2 text-sm text-niat-muted">Showing {data.rows.length} of {data.total}</p>}
    </div>
  );
}
