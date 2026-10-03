import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { api, type EventInfo, type Room } from '../../lib/api';
import { PageHeader, statusBadge, useAdmin } from './AdminLayout';

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
}

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
});

export default function EventSetup() {
  const { event, reload, selectEvent } = useAdmin();
  const location = useLocation();
  const [creating, setCreating] = useState(!event || Boolean((location.state as { create?: boolean } | null)?.create));
  const current = creating ? null : event;

  return (
    <div>
      <PageHeader
        title={creating ? 'Create New Event' : 'Event Setup'}
        subtitle={creating ? 'Each event has its own fresh attendance and seating. Participants can be reused.' : undefined}
        actions={!creating && <button className="btn-secondary" onClick={() => setCreating(true)}>+ New Event</button>}
      />
      {current && <Lifecycle event={current} />}
      <EventForm
        key={current?.id ?? 'new'}
        event={current}
        onSaved={async (saved) => {
          if (creating) {
            selectEvent(saved.id);
            setCreating(false);
          }
          await reload();
        }}
        onCancel={event && creating ? () => setCreating(false) : undefined}
      />
      {current && <Rooms event={current} />}
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
  const [draft, setDraft] = useState({ name: '', capacity: '', priority: '' });
  const [error, setError] = useState<string | null>(null);
  const editable = event.status === 'draft';

  const load = () => api<Room[]>(`/events/${event.id}/rooms`).then(setRooms);
  useEffect(() => { load(); }, [event.id, event.teamSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/events/${event.id}/rooms`, {
        body: {
          name: draft.name || `Room ${rooms.length + 1}`,
          capacity: Number(draft.capacity),
          priority: Number(draft.priority) || Math.max(0, ...rooms.map((r) => r.priority)) + 1,
        },
      });
      setDraft({ name: '', capacity: '', priority: '' });
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    await api(`/events/${event.id}/rooms/${id}`, { method: 'DELETE' });
    await load();
  };

  const totalCapacity = rooms.reduce((s, r) => s + r.capacity, 0);
  const totalTeams = rooms.reduce((s, r) => s + (r.teamCount || r.plannedTeams), 0);

  return (
    <div className="card mb-6">
      <h2 className="text-lg font-semibold">Rooms</h2>
      <p className="mt-1 text-sm text-niat-muted">Rooms fill one at a time in priority order. Capacity is the number of students.</p>

      <table className="mt-4 w-full text-left text-sm">
        <thead className="border-b border-niat-line text-niat-muted">
          <tr><th className="py-2">Priority</th><th>Room</th><th>Capacity</th><th>Tables</th><th>Table numbers</th>{editable && <th />}</tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b border-niat-line/60">
              <td className="py-2.5 font-mono">{r.priority}</td>
              <td className="font-medium">{r.name}</td>
              <td>{r.capacity} students</td>
              <td>
                {r.plannedTeams}
                {r.partialTeamSeats > 0 && <span className="ml-1 text-xs text-niat-muted">(last table has {r.partialTeamSeats} seat{r.partialTeamSeats > 1 ? 's' : ''})</span>}
              </td>
              <td className="text-niat-muted">{r.firstTeam ? `${event.teamNamePrefix} ${r.firstTeam}–${r.lastTeam}` : '—'}</td>
              {editable && <td className="text-right"><button className="text-rose-600 hover:underline" onClick={() => remove(r.id)}>Remove</button></td>}
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

      {rooms.length > 0 && totalCapacity < event.expectedStudents && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Total room capacity ({totalCapacity}) is less than expected students ({event.expectedStudents}). Students beyond {totalCapacity} won't get a seat.
        </p>
      )}

      {editable && (
        <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="w-48"><span className="label">Room name</span>
            <input className="input" value={draft.name} placeholder={`Room ${rooms.length + 1}`} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="w-32"><span className="label">Capacity</span>
            <input className="input" type="number" min={1} required value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: e.target.value })} /></label>
          <label className="w-28"><span className="label">Priority</span>
            <input className="input" type="number" min={1} value={draft.priority} placeholder={String(Math.max(0, ...rooms.map((r) => r.priority)) + 1)}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })} /></label>
          <button className="btn-secondary">+ Add room</button>
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </form>
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
            Activating creates all tables and seats from the rooms above and opens the check-in screen.
            Rooms, team size and seat labels can't be changed afterwards. Make sure participants are <Link className="text-niat-maroon underline" to="/admin/import">imported</Link> (more can be added later).
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
