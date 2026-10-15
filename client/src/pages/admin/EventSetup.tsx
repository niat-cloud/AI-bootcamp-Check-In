import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { api, type EventInfo, type LocationInfo, type Room } from '../../lib/api';
import { PageHeader, statusBadge, useAdmin } from './AdminLayout';
import { EventLink } from './EventLink';
import { RoomDialog } from './rooms/RoomDialog';
import type { OverviewRoom } from './rooms/types';

const LETTERS = 'ABCDEFGH'.split('');

interface FormState {
  name: string;
  date: string;
  time: string;
  expectedStudents: string;
  teamSize: string;
  seatLabels: string;
  teamNamePrefix: string;
  activePoolSize: string;
  poolFillThreshold: string;
  locationId: string;
  slug: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** Same rule as the server: 2026-10-18 → 18-oct-2026. */
const dateSlug = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? `${d}-${MONTHS[m - 1]}-${y}` : '';
};

const nextSunday = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d.toLocaleDateString('en-CA');
};

const toForm = (e: EventInfo | null): FormState => ({
  name: e?.name ?? '',
  date: e?.date ?? nextSunday(),
  time: e?.time ?? '10:00',
  expectedStudents: String(e?.expectedStudents ?? 100),
  teamSize: String(e?.teamSize ?? 3),
  seatLabels: (e?.seatLabels ?? ['A', 'B', 'C']).join(', '),
  teamNamePrefix: e?.teamNamePrefix ?? 'Team',
  activePoolSize: String(e?.activePoolSize ?? 5),
  poolFillThreshold: String(Math.round((e?.poolFillThreshold ?? 0.6) * 100)),
  locationId: e?.locationId ? String(e.locationId) : '',
  slug: e?.slug ?? '',
});

const toPayload = (f: FormState) => ({
  name: f.name,
  date: f.date,
  time: f.time,
  expectedStudents: Number(f.expectedStudents),
  teamSize: Number(f.teamSize),
  seatLabels: f.seatLabels.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
  teamNamePrefix: f.teamNamePrefix,
  activePoolSize: Number(f.activePoolSize),
  poolFillThreshold: Number(f.poolFillThreshold) / 100,
  locationId: f.locationId ? Number(f.locationId) : null,
  // Empty means "use the date"; the server adds -2, -3 … if that link is already taken.
  slug: f.slug.trim().toLowerCase().replace(/^-+|-+$/g, '') || dateSlug(f.date),
});

export default function EventSetup() {
  const { event, reload, selectEvent } = useAdmin();
  const location = useLocation();
  const [creating, setCreating] = useState(!event || Boolean((location.state as { create?: boolean } | null)?.create));
  // After creating an event, wait until the admin context has switched to it, so the previous
  // event's details and rooms are never shown under the new event.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const switching = createdId !== null && event?.id !== createdId;
  const current = creating || switching ? null : event;
  useEffect(() => { if (createdId !== null && event?.id === createdId) setCreatedId(null); }, [createdId, event?.id]);

  return (
    <div>
      <PageHeader
        title={creating ? 'Create New Event' : 'Event Setup'}
        subtitle={creating ? 'Each event has its own fresh attendance and seating. Participants can be reused.' : undefined}
        actions={!creating && <button className="btn-secondary" onClick={() => setCreating(true)}>+ New Event</button>}
      />
      {switching ? (
        <div className="card text-niat-muted" role="status">Opening the new event…</div>
      ) : (
        <>
          {current && <Lifecycle event={current} />}
          {current && <EventLink event={current} />}
          <EventForm
            key={current?.id ?? 'new'}
            event={current}
            onSaved={async (saved) => {
              if (creating) {
                // selectEvent triggers a reload of the new event; no extra reload of the old one.
                setCreatedId(saved.id);
                setCreating(false);
                selectEvent(saved.id);
                return;
              }
              await reload();
            }}
            onCancel={event && creating ? () => setCreating(false) : undefined}
          />
        </>
      )}
      {current && <Rooms key={current.id} event={current} />}
      {current && <StatusActions event={current} onChanged={reload} />}
    </div>
  );
}

function Lifecycle({ event }: { event: EventInfo }) {
  const steps = [
    { label: 'Create event', done: true },
    { label: 'Rooms & teams', done: event.status !== 'draft' },
    { label: 'Import participants', done: event.status !== 'draft' },
    { label: 'Activate', done: event.status !== 'draft' },
    { label: 'Check-in', done: event.status === 'completed' },
    { label: 'Complete', done: event.status === 'completed' },
  ];
  return (
    <div className="card mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 py-3 text-sm">
      <span className={`mr-2 rounded-full px-2.5 py-0.5 font-semibold capitalize ${statusBadge[event.status]}`}>{event.status}</span>
      {steps.map((s, i) => (
        <span key={s.label} className="flex items-center gap-2">
          <span className={s.done ? 'font-medium text-emerald-700' : 'text-niat-muted'}>{s.done ? '✓ ' : ''}{s.label}</span>
          {i < steps.length - 1 && <span className="text-niat-line">→</span>}
        </span>
      ))}
    </div>
  );
}

function EventForm({ event, onSaved, onCancel }: { event: EventInfo | null; onSaved: (e: EventInfo) => Promise<void>; onCancel?: () => void }) {
  const [form, setForm] = useState<FormState>(toForm(event));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = event?.status === 'completed';
  const seatingLocked = event ? event.status !== 'draft' : false;
  const [locations, setLocations] = useState<LocationInfo[]>([]);

  // Only the locations this admin manages (the server scopes the list). One location: pick it for them.
  useEffect(() => {
    api<LocationInfo[]>('/platform/locations').then((list) => {
      const usable = list.filter((l) => l.isActive || String(l.id) === form.locationId);
      setLocations(usable);
      if (!event && usable.length === 1) setForm((f) => (f.locationId ? f : { ...f, locationId: String(usable[0].id) }));
    }).catch(() => setLocations([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const chosenLocation = locations.find((l) => String(l.id) === form.locationId);

  const update = (key: keyof FormState, value: string) => {
    const next = { ...form, [key]: value };
    if (key === 'teamSize') {
      const n = Math.min(8, Math.max(2, Number(value) || 0));
      next.seatLabels = LETTERS.slice(0, n).join(', ');
    }
    setForm(next);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = event
        ? await api<EventInfo>(`/events/${event.id}`, { method: 'PATCH', body: toPayload(form) })
        : await api<EventInfo>('/events', { body: toPayload(form) });
      setMessage({ ok: true, text: 'Saved.' });
      await onSaved(saved);
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const input = (key: keyof FormState, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input className="input" value={form[key]} onChange={(e) => update(key, e.target.value)} disabled={locked} {...props} />
  );

  return (
    <form onSubmit={save} className="card mb-6">
      <h2 className="text-lg font-semibold">Event details</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="sm:col-span-2"><span className="label">Event name</span>{input('name', { required: true, placeholder: 'Sunday Student Event' })}</label>
        <label><span className="label">Date</span>{input('date', { type: 'date', required: true })}</label>
        <label><span className="label">Time</span>{input('time', { type: 'time' })}</label>
        <label><span className="label">Expected students</span>{input('expectedStudents', { type: 'number', min: 0 })}</label>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Location &amp; public link</h2>
      {seatingLocked && <p className="mt-1 text-sm text-amber-700">The location and link are fixed once the event is activated, so printed QR codes keep working.</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className="label">Location</span>
          <select className="input" value={form.locationId} onChange={(e) => update('locationId', e.target.value)} disabled={locked || seatingLocked} required>
            <option value="">Choose a location…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.city && l.city !== l.name ? ` · ${l.city}` : ''}</option>)}
          </select>
          {locations.length === 0 && <span className="mt-1 block text-xs text-niat-muted">No locations available. The super admin adds locations under Platform → Locations.</span>}
        </label>
        <label className="sm:col-span-2 lg:col-span-3">
          <span className="label">Link</span>
          <div className={`flex items-center overflow-hidden rounded-xl border border-niat-line bg-white focus-within:border-niat-maroon ${locked || seatingLocked ? 'opacity-60' : ''}`}>
            <span className="shrink-0 truncate border-r border-niat-line bg-niat-warm-white px-3 py-2.5 font-mono text-sm text-niat-muted">
              {window.location.host}/{chosenLocation?.slug ?? 'location'}/
            </span>
            <input className="min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm outline-none" value={form.slug}
              onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder={dateSlug(form.date)} disabled={locked || seatingLocked} spellCheck={false} maxLength={60} />
          </div>
          <span className="mt-1 block text-xs text-niat-muted">
            Leave as the date unless you need a custom name, e.g. <code>morning</code>. A second event at the same location on the same day gets <code>-2</code> automatically.
          </span>
        </label>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Teams & seating</h2>
      {seatingLocked && <p className="mt-1 text-sm text-amber-700">Team size and seat labels are locked once the event is activated.</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label><span className="label">Team size (seats per table)</span>{input('teamSize', { type: 'number', min: 2, max: 8, disabled: locked || seatingLocked })}</label>
        <label><span className="label">Seat labels</span>{input('seatLabels', { disabled: locked || seatingLocked, placeholder: 'A, B, C' })}</label>
        <label><span className="label">Team name prefix</span>{input('teamNamePrefix', { disabled: locked || seatingLocked })}
          <span className="mt-1 block text-xs text-niat-muted">Shown as “{form.teamNamePrefix || 'Team'} 1, {form.teamNamePrefix || 'Team'} 2 …”</span>
        </label>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Smart allocation</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label><span className="label">Active team pool size</span>{input('activePoolSize', { type: 'number', min: 1 })}
          <span className="mt-1 block text-xs text-niat-muted">Tables opened at a time.</span>
        </label>
        <label><span className="label">Open next batch at (% full)</span>{input('poolFillThreshold', { type: 'number', min: 10, max: 100 })}
          <span className="mt-1 block text-xs text-niat-muted">When open tables reach this fill level, the next {form.activePoolSize || 'N'} tables open.</span>
        </label>
      </div>

      {!locked && (
        <div className="mt-6 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Create event'}</button>
          {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}
          {message && <span className={message.ok ? 'text-emerald-700' : 'text-rose-600'}>{message.text}</span>}
        </div>
      )}
    </form>
  );
}

function Rooms({ event }: { event: EventInfo }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dialog, setDialog] = useState<{ room?: Room } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Rooms stay editable until the event is completed; capacity can grow or shrink mid-event.
  const editable = event.status !== 'completed';

  // Ignore any reply that arrives after this table has moved on to another event.
  const eventIdRef = useRef(event.id);
  eventIdRef.current = event.id;
  const load = () => {
    const forEvent = event.id;
    return api<Room[]>(`/events/${forEvent}/rooms`).then((r) => { if (eventIdRef.current === forEvent) setRooms(r); });
  };
  useEffect(() => { load(); }, [event.id, event.teamSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (room: Room) => {
    try {
      await api(`/events/${event.id}/rooms/${room.id}`, { method: 'DELETE' });
      setMessage({ ok: true, text: `${room.name} removed.` });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
    await load();
  };

  const totalCapacity = rooms.filter((r) => r.isActive !== false).reduce((s, r) => s + r.capacity, 0);
  const totalTeams = rooms.reduce((s, r) => s + (r.teamCount || r.plannedTeams), 0);
  const gap = event.expectedStudents - totalCapacity;

  return (
    <div className="card mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Rooms</h2>
          <p className="mt-1 text-sm text-niat-muted">
            Rooms fill one at a time in priority order. Capacity is the number of students, and you can change it at any time, even during the event.
          </p>
        </div>
        {editable && <button className="btn-secondary" onClick={() => setDialog({})}>+ Add Room</button>}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-niat-line text-niat-muted">
            <tr><th className="py-2">Priority</th><th>Room</th><th>Capacity</th><th>Tables</th><th>Table numbers</th>{editable && <th><span className="sr-only">Actions</span></th>}</tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id} className="border-b border-niat-line/60">
                <td className="py-2.5 font-mono">{r.priority}</td>
                <td className="font-medium">
                  {r.name}
                  {r.isActive === false && <span className="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-niat-muted">Disabled</span>}
                </td>
                <td>{r.capacity} students{r.used ? <span className="text-niat-muted"> · {r.used} seated</span> : null}</td>
                <td>
                  {r.teamCount || r.plannedTeams}
                  {r.partialTeamSeats > 0 && <span className="ml-1 text-xs text-niat-muted">(last table has {r.partialTeamSeats} seat{r.partialTeamSeats > 1 ? 's' : ''})</span>}
                </td>
                <td className="text-niat-muted">{r.firstTeam ? `${event.teamNamePrefix} ${r.firstTeam}–${r.lastTeam}` : '—'}</td>
                {editable && (
                  <td className="space-x-3 whitespace-nowrap text-right">
                    <button className="font-semibold text-niat-maroon hover:underline" onClick={() => setDialog({ room: r })}>Edit</button>
                    {!r.used && (
                      <ConfirmButton className="font-semibold text-rose-700 hover:underline" confirmText={`Remove ${r.name}?`} onConfirm={() => remove(r)}>
                        Remove
                      </ConfirmButton>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {rooms.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-niat-muted">No rooms yet. Add at least one.</td></tr>}
          </tbody>
          {rooms.length > 0 && (
            <tfoot className="font-semibold">
              <tr><td className="py-2.5" /><td>Total</td><td>{totalCapacity} seats</td><td>{totalTeams} tables</td><td colSpan={2} /></tr>
            </tfoot>
          )}
        </table>
      </div>

      {rooms.length > 0 && gap > 0 && (
        <p className="mt-3 rounded-lg bg-niat-cream p-3 text-sm text-niat-text ring-1 ring-niat-gold/40">
          You've planned <strong>{totalCapacity} seats</strong> for <strong>{event.expectedStudents} expected students</strong> ({gap} short).
          That's fine to start with: raise a room's capacity or add a room at any time, even during the event.
          Anyone who arrives while every seat is taken is checked in and put on a <strong>waiting list</strong>, and is seated as soon as you add capacity
          {' '}(<Link className="font-semibold text-niat-maroon underline" to="/admin/teams">Rooms &amp; Teams → Auto-Allocate</Link>).
        </p>
      )}

      {message && (
        <p className={`mt-3 text-sm ${message.ok ? 'text-emerald-700' : 'text-niat-maroon'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>
      )}

      {dialog && (
        <RoomDialog
          eventId={event.id}
          eventStatus={event.status}
          eventTeamSize={event.teamSize}
          roomCount={rooms.length}
          room={dialog.room as OverviewRoom | undefined}
          onClose={() => setDialog(null)}
          onSaved={(text) => { setDialog(null); setMessage({ ok: true, text }); load(); }}
        />
      )}
    </div>
  );
}

function StatusActions({ event, onChanged }: { event: EventInfo; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const run = async (path: string) => {
    setError(null);
    try {
      await api(`/events/${event.id}/${path}`, { method: 'POST' });
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold">Event status</h2>
      {event.status === 'draft' && (
        <>
          <p className="mt-1 text-sm text-niat-muted">
            Activating creates all tables and seats from the rooms above and opens the student check-in link.
            Team size and seat labels are fixed after that, but rooms and their capacity can still be added, raised or reduced at any time. Make sure participants are <Link className="text-niat-maroon underline" to="/admin/import">imported</Link> (more can be added later).
          </p>
          <div className="mt-4">
            <ConfirmButton className="btn-success" confirmText="Activate this event and open check-in?" onConfirm={() => run('activate')}>
              Activate Event
            </ConfirmButton>
          </div>
        </>
      )}
      {event.status === 'active' && (
        <>
          <p className="mt-1 text-sm text-niat-muted">Check-in is open. Completing the event stops all new seat assignments. Data stays available for export.</p>
          <div className="mt-4">
            <ConfirmButton className="btn-danger" confirmText="Complete the event? No more seats can be assigned." onConfirm={() => run('complete')}>
              Mark Event Completed
            </ConfirmButton>
          </div>
        </>
      )}
      {event.status === 'completed' && (
        <p className="mt-1 text-sm text-niat-muted">This event is completed. Create a new event for the next session — participants can be copied over from this one.</p>
      )}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </div>
  );
}
