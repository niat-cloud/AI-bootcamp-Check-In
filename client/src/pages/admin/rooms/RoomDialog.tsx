import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '../../../lib/api';
import { plural, type OverviewRoom } from './types';

export interface RoomDialogProps {
  eventId: number;
  eventStatus: 'draft' | 'active' | 'completed';
  eventTeamSize: number;
  roomCount: number;
  /** Omit to create a room. */
  room?: OverviewRoom;
  /** Pre-filled capacity, e.g. "+ Add team" opens the dialog with one more table's worth of seats. */
  suggestedCapacity?: number;
  intro?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Add or edit a room. Everything is validated here and again on the server, which owns the rules. */
export function RoomDialog({ eventId, eventStatus, eventTeamSize, roomCount, room, suggestedCapacity, intro, onClose, onSaved }: RoomDialogProps) {
  const editing = Boolean(room);
  const [name, setName] = useState(room?.name ?? `Room ${roomCount + 1}`);
  const [capacity, setCapacity] = useState(String(suggestedCapacity ?? room?.capacity ?? 60));
  const [teamSize, setTeamSize] = useState(String(room?.teamSize ?? eventTeamSize));
  const [isActive, setIsActive] = useState(room?.isActive ?? true);
  const [priority, setPriority] = useState(String(room?.priority ?? roomCount + 1));
  const [confirmReduction, setConfirmReduction] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);

  const initial = useRef({ name, capacity, teamSize, isActive, priority });
  const dirty = name !== initial.current.name || capacity !== initial.current.capacity || teamSize !== initial.current.teamSize
    || isActive !== initial.current.isActive || priority !== initial.current.priority;

  /** Close, but ask once before throwing away edits. */
  const requestClose = () => {
    if (busy) return;
    if (dirty && !confirmDiscard) setConfirmDiscard(true);
    else onClose();
  };

  useEffect(() => { firstField.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cap = Number(capacity);
  const size = Number(teamSize);
  const occupied = room?.used ?? 0;
  const capValid = Number.isInteger(cap) && cap >= 1 && cap <= 2000;
  const sizeValid = Number.isInteger(size) && size >= 2 && size <= 8;
  const belowOccupancy = capValid && cap < occupied;
  const reducing = editing && capValid && cap < room!.capacity;
  const teamSizeLocked = editing && eventStatus === 'active' && occupied > 0;
  const completeTeams = capValid && sizeValid ? Math.floor(cap / size) : 0;
  const leftover = capValid && sizeValid ? cap % size : 0;
  const maxPriority = editing ? roomCount : roomCount + 1;

  const problems = [
    !name.trim() && 'Enter a room name.',
    !capValid && 'Approved capacity must be a whole number between 1 and 2000.',
    !sizeValid && 'Students per team must be between 2 and 8.',
    belowOccupancy && `${occupied} students are already seated here, so capacity cannot go below ${occupied}.`,
  ].filter(Boolean) as string[];
  const canSave = problems.length === 0 && (!reducing || confirmReduction) && !busy;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      capacity: cap,
      teamSize: size,
      isActive,
      priority: Number(priority),
      confirmReduction: reducing ? true : undefined,
    };
    try {
      if (editing) {
        await api(`/events/${eventId}/rooms/${room!.id}`, { method: 'PATCH', body });
        onSaved(`${body.name} saved · ${plural(cap, 'approved seat')}`);
      } else {
        await api(`/events/${eventId}/rooms`, { body });
        onSaved(`${body.name} added · ${plural(completeTeams, 'team')}${leftover ? ` + 1 table of ${leftover}` : ''}`);
      }
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-niat-text/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby={titleId} noValidate
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-[var(--shadow-lift)] sm:rounded-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-niat-line bg-white px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-extrabold">{editing ? `Edit ${room!.name}` : 'Add room'}</h2>
            <p className="mt-0.5 text-sm text-niat-muted">
              {intro ?? (eventStatus === 'active' ? 'Changes apply to live allocation immediately.' : 'Tables are created when the event is activated.')}
            </p>
          </div>
          <button type="button" onClick={requestClose} disabled={busy} aria-label="Close"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-xl text-niat-muted hover:bg-niat-pink hover:text-niat-maroon">×</button>
        </header>

        <div className="space-y-4 px-5 py-5">
          <Field label="Room name">
            <input ref={firstField} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Approved seats" hint="Students this room may hold">
              <input className={`input tabular-nums ${belowOccupancy ? 'border-niat-maroon' : ''}`} type="number" inputMode="numeric" min={Math.max(1, occupied)} max={2000}
                value={capacity} onChange={(e) => { setCapacity(e.target.value); setConfirmReduction(false); }} />
            </Field>
            <Field label="Students per team" hint={teamSizeLocked ? 'Locked: students are seated' : `Event default: ${eventTeamSize}`}>
              <input className="input tabular-nums" type="number" inputMode="numeric" min={2} max={8} value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)} disabled={teamSizeLocked} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Allocation priority" hint="1 fills first">
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Array.from({ length: maxPriority }, (_, i) => i + 1).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Availability">
              <label className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-niat-line px-3">
                <input type="checkbox" className="h-4 w-4 accent-[#A7191E]" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span className="text-sm font-medium">{isActive ? 'Enabled for allocation' : 'Disabled'}</span>
              </label>
            </Field>
          </div>

          {/* Live preview of the layout this will produce. */}
          <div className="rounded-xl bg-niat-warm-white p-4 ring-1 ring-niat-line" aria-live="polite">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-niat-muted">Preview</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <Preview label="Complete teams" value={capValid && sizeValid ? completeTeams : '—'} />
              <Preview label="Extra seats" value={capValid && sizeValid ? leftover : '—'} note={leftover ? `1 smaller table` : undefined} />
              <Preview label="Seated now" value={occupied} />
              <Preview label="Remaining" value={capValid ? Math.max(0, cap - occupied) : '—'} />
            </dl>
            {capValid && sizeValid && (
              <p className="mt-2 text-xs text-niat-muted">
                Tables Team 1–{completeTeams + (leftover ? 1 : 0)} · seats 1A–{completeTeams + (leftover ? 1 : 0)}{String.fromCharCode(64 + (leftover || size))}
              </p>
            )}
          </div>

          {!isActive && editing && occupied > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Disabling stops new allocations here. The {plural(occupied, 'student')} already seated keep their seats.
            </p>
          )}

          {reducing && !belowOccupancy && (
            <label className="flex cursor-pointer gap-3 rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#A7191E]" checked={confirmReduction} onChange={(e) => setConfirmReduction(e.target.checked)} />
              <span>
                Remove {plural(room!.capacity - cap, 'approved seat')}. Only empty seats at the end of the room are removed;
                if any of them is occupied the change is refused and nobody is moved.
              </span>
            </label>
          )}

          {problems.length > 0 && (
            <ul className="space-y-1 text-sm font-medium text-niat-maroon" role="alert">
              {problems.map((p) => <li key={p}>⚠ {p}</li>)}
            </ul>
          )}
          {error && <p className="rounded-lg bg-niat-pink px-3 py-2 text-sm font-medium text-niat-maroon-dark ring-1 ring-niat-maroon/20" role="alert">{error}</p>}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-niat-line bg-white px-5 py-3">
          {confirmDiscard && (
            <p className="mr-auto flex items-center gap-2 text-sm font-medium text-amber-900" role="alert">
              Discard your changes?
              <button type="button" className="font-bold text-niat-maroon underline" onClick={onClose}>Discard</button>
              <button type="button" className="font-semibold text-niat-muted underline" onClick={() => setConfirmDiscard(false)}>Keep Editing</button>
            </p>
          )}
          <button type="button" className="btn-secondary" onClick={requestClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!canSave}>
            {busy ? 'Saving…' : editing ? 'Save Room' : 'Add Room'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-niat-muted">{hint}</span>}
    </label>
  );
}

function Preview({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-niat-muted">{label}</dt>
      <dd className="text-lg font-extrabold tabular-nums">{value}</dd>
      {note && <dd className="text-[11px] text-niat-muted">{note}</dd>}
    </div>
  );
}
