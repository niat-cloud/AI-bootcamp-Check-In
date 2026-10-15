import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ConfirmButton from '../../components/ConfirmButton';
import { api, formatTime, type ApiError } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';
import { OverflowPanel } from './rooms/OverflowPanel';
import { OverviewStats } from './rooms/OverviewStats';
import { RoomDialog, type RoomDialogProps } from './rooms/RoomDialog';
import { RoomNav } from './rooms/RoomNav';
import { emptyFilters, filtersActive, SearchBar, SearchResults, type Filters } from './rooms/SearchPanel';
import { TeamCard } from './rooms/TeamCard';
import { plural, type OverviewRoom, type RoomsOverview } from './rooms/types';

type DialogState = Omit<RoomDialogProps, 'eventId' | 'eventStatus' | 'eventTeamSize' | 'roomCount' | 'onClose' | 'onSaved'> | null;

export default function Teams() {
  const { event } = useAdmin();
  const [data, setData] = useState<RoomsOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The selected room lives in the URL (?room=ID) so refreshes and shared links keep it.
  const [params, setParams] = useSearchParams();
  const [filters, setFilterState] = useState<Filters>(() => {
    const room = Number(params.get('room'));
    return { ...emptyFilters, roomId: Number.isInteger(room) && room > 0 ? room : 'all' };
  });
  const setFilters = (next: Filters) => {
    setFilterState(next);
    setParams(next.roomId === 'all' ? {} : { room: String(next.roomId) }, { replace: true });
  };
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const live = event?.status === 'active';
  const canEdit = event?.status !== 'completed';

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setData(await api<RoomsOverview>(`/events/${event.id}/rooms-overview`));
      setLoadError(null);
    } catch (err) {
      setLoadError((err as ApiError).message);
    }
  }, [event]);

  useEffect(() => {
    load();
    if (!live) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load, live]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = async () => {
    await load();
    setRefreshKey((k) => k + 1);
  };

  const run = async (work: () => Promise<string>) => {
    try {
      setToast({ tone: 'ok', text: await work() });
    } catch (err) {
      setToast({ tone: 'error', text: (err as ApiError).message });
    }
    await refresh();
  };

  const allocate = () => {
    if (!event) return;
    setAllocating(true);
    run(async () => {
      const r = await api<{ allocated: number; stillWaiting: number }>(`/events/${event.id}/allocate`, { method: 'POST' });
      if (r.allocated === 0) return r.stillWaiting ? `No free seats: ${plural(r.stillWaiting, 'student')} still waiting.` : 'Nobody is waiting for a seat.';
      return `${plural(r.allocated, 'student')} seated.${r.stillWaiting ? ` ${r.stillWaiting} still waiting.` : ' Nobody is waiting.'}`;
    }).finally(() => setAllocating(false));
  };

  const editRoom = (room: OverviewRoom) => setDialog({ room });
  const addTeam = (room: OverviewRoom) => setDialog({
    room,
    suggestedCapacity: room.capacity + room.teamSize,
    intro: `Adding a team raises ${room.name}'s approved capacity by ${room.teamSize} seats.`,
  });

  const visibleRooms = useMemo(
    () => (data?.rooms ?? []).filter((r) => filters.roomId === 'all' || r.id === filters.roomId),
    [data, filters.roomId],
  );

  if (!event) return <NoEvent />;

  const header = (
    <PageHeader
      title="Rooms & Teams"
      subtitle="Manage room capacity, team allocation, and live student check-in."
      actions={(
        <div className="flex flex-wrap gap-2">
          {canEdit && <button className="btn-secondary" onClick={() => setDialog({})}>+ Add Room</button>}
          {live && (
            <button className="btn-primary" onClick={allocate}
              disabled={allocating || !data || data.stats.waiting === 0 || data.stats.availableSeats === 0}
              title={!data || data.stats.waiting === 0
                ? 'Nobody is waiting for a seat'
                : data.stats.availableSeats === 0 ? 'No free approved seats: add a room or raise capacity first'
                : 'Seat waiting students in arrival order. Seated students are never moved.'}>
              {allocating ? 'Allocating…' : `Auto-Allocate${data?.stats.waiting ? ` (${data.stats.waiting})` : ''}`}
            </button>
          )}
          <Link to="/admin/export" className="btn-secondary">Export</Link>
        </div>
      )}
    />
  );

  if (!data) {
    return (
      <div>
        {header}
        {loadError ? (
          <div className="card text-center" role="alert">
            <p className="font-semibold text-niat-maroon">Couldn't load rooms: {loadError}</p>
            <button className="btn-secondary mt-4" onClick={load}>Try Again</button>
          </div>
        ) : (
          <div className="grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" aria-label="Loading">
            {Array.from({ length: 7 }, (_, i) => <div key={i} className="h-24 rounded-xl bg-niat-line/50" />)}
          </div>
        )}
      </div>
    );
  }

  const tablesBuilt = data.teams.length > 0;

  return (
    <div>
      {header}

      {toast && (
        <div role="status" aria-live="polite"
          className={`mb-4 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
            toast.tone === 'ok' ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200' : 'bg-niat-pink text-niat-maroon-dark ring-1 ring-niat-maroon/20'}`}>
          <span>{toast.tone === 'ok' ? '✓ ' : '⚠ '}{toast.text}</span>
          <button className="shrink-0 font-bold opacity-60 hover:opacity-100" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {loadError && <p className="mb-4 text-sm text-niat-maroon" role="alert">Live update failed ({loadError}). Showing the last data received.</p>}

      {event.status === 'completed' && (
        <p className="mb-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-niat-muted">This event is completed. Rooms and seats are read-only; data stays available for search and export.</p>
      )}
      {event.status === 'draft' && (
        <p className="mb-4 rounded-xl bg-niat-cream px-4 py-3 text-sm text-niat-text ring-1 ring-niat-gold/40">
          Draft event: rooms can be planned freely. Tables and seats are created when you activate the event in <Link className="font-semibold text-niat-maroon underline" to="/admin/setup">Event Setup</Link>.
        </p>
      )}

      <OverviewStats stats={data.stats} />

      {data.stats.participants === 0 && (
        <div className="mt-6 card text-center">
          <p className="font-semibold">No participants yet.</p>
          <p className="mt-1 text-sm text-niat-muted">Import a list, or let students register as walk-ins at the gate.</p>
          <Link to="/admin/import" className="btn-primary mt-4">Import Participants</Link>
        </div>
      )}

      <OverflowPanel data={data} canEdit={live} allocating={allocating} onAllocate={allocate}
        onAddRoom={() => setDialog({})} onEditRoom={(id) => { const r = data.rooms.find((x) => x.id === id); if (r) editRoom(r); }} />

      {live && data.stats.waiting === 0 && data.rooms.length > 0 && data.stats.availableSeats === 0 && (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <strong>Every approved seat is taken.</strong> New arrivals will be checked in and placed on the waiting list.
          {' '}<button className="font-semibold underline" onClick={() => setDialog({})}>Add a room</button> or raise a room's capacity to keep seating people.
        </p>
      )}

      {data.rooms.length === 0 ? (
        <div className="mt-6 card text-center">
          <p className="text-lg font-bold">No rooms configured</p>
          <p className="mt-1 text-sm text-niat-muted">Add a room with its approved seat count. Rooms fill one at a time, in priority order.</p>
          {canEdit && <button className="btn-primary mt-4" onClick={() => setDialog({})}>+ Add Room</button>}
        </div>
      ) : (
        <>
          <RoomNav rooms={data.rooms} selected={filters.roomId} onSelect={(id) => setFilters({ ...filters, roomId: id, team: 'all' })} />
          <SearchBar filters={filters} onChange={setFilters} rooms={data.rooms} teams={data.teams} />

          {filtersActive(filters) && (
            <SearchResults eventId={event.id} filters={filters} prefix={event.teamNamePrefix} refreshKey={refreshKey}
              onLocate={({ roomId, eventParticipantId }) => {
                setFilters({ ...emptyFilters, roomId });
                setHighlight(eventParticipantId);
                const team = data.teams.find((t) => t.seats.some((s) => s.eventParticipantId === eventParticipantId));
                if (team) setTimeout(() => document.getElementById(`team-${team.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
              }} />
          )}

          <div className="mt-6 space-y-8">
            {visibleRooms.map((room) => (
              <RoomSection key={room.id} room={room} data={data} canEdit={canEdit} tablesBuilt={tablesBuilt} highlight={highlight}
                isFirst={room.priority === Math.min(...data.rooms.map((r) => r.priority))}
                isLast={room.priority === Math.max(...data.rooms.map((r) => r.priority))}
                onEdit={() => editRoom(room)}
                onAddTeam={() => addTeam(room)}
                onToggle={() => run(async () => {
                  await api(`/events/${event.id}/rooms/${room.id}`, { method: 'PATCH', body: { name: room.name, capacity: room.capacity, isActive: !room.isActive } });
                  return room.isActive ? `${room.name} disabled. Students already seated keep their seats.` : `${room.name} enabled for allocation.`;
                })}
                onMove={(direction) => run(async () => {
                  await api(`/events/${event.id}/rooms/${room.id}/move`, { body: { direction } });
                  return `${room.name} moved ${direction} in allocation order.`;
                })}
                onDelete={() => run(async () => {
                  await api(`/events/${event.id}/rooms/${room.id}`, { method: 'DELETE' });
                  return `${room.name} removed.`;
                })} />
            ))}
          </div>
        </>
      )}

      {data.log.length > 0 && <ChangeLog log={data.log} rooms={data.rooms} />}

      {dialog && (
        <RoomDialog {...dialog} eventId={event.id} eventStatus={event.status} eventTeamSize={event.teamSize}
          roomCount={data.rooms.length}
          onClose={() => setDialog(null)}
          onSaved={(message) => { setDialog(null); setToast({ tone: 'ok', text: message }); refresh(); }} />
      )}
    </div>
  );
}

function RoomSection({ room, data, canEdit, tablesBuilt, highlight, isFirst, isLast, onEdit, onAddTeam, onToggle, onMove, onDelete }: {
  room: OverviewRoom;
  data: RoomsOverview;
  canEdit: boolean;
  tablesBuilt: boolean;
  highlight: number | null;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onAddTeam: () => void;
  onToggle: () => void;
  onMove: (d: 'up' | 'down') => void;
  onDelete: () => void;
}) {
  const teams = data.teams.filter((t) => t.roomId === room.id);
  const pct = room.capacity ? Math.min(100, Math.round((room.used / room.capacity) * 100)) : 0;
  const prefix = data.event.teamNamePrefix;

  return (
    <section aria-labelledby={`room-${room.id}`} className={`rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)] sm:p-5 ${room.isActive ? 'border-niat-line' : 'border-dashed border-stone-300 opacity-90'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-niat-cream px-1.5 py-0.5 text-xs font-extrabold text-niat-maroon" title="Allocation priority">P{room.priority}</span>
            <h2 id={`room-${room.id}`} className="text-xl font-extrabold">{room.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${room.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-niat-muted'}`}>
              {room.isActive ? '● Enabled' : '○ Disabled'}
            </span>
          </div>
          <p className="mt-1 text-sm tabular-nums text-niat-muted">
            <strong className="text-niat-text">{room.used}/{room.capacity}</strong> seated · {plural(room.available, 'free seat')} ·{' '}
            {plural(tablesBuilt ? room.teamCount : room.completeTeams + (room.partialSeats ? 1 : 0), 'team')} of {room.teamSize}
            {room.partialSeats > 0 && ` (last table seats ${room.partialSeats})`}
          </p>
          <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-niat-line/60" aria-hidden>
            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-600' : 'bg-gradient-to-r from-niat-maroon to-niat-gold'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button className="btn-secondary px-3 py-1.5 text-sm" onClick={onEdit}>Edit</button>
            <button className="btn-secondary px-3 py-1.5 text-sm" onClick={onAddTeam} title={`Adds ${room.teamSize} approved seats`}>+ Add Team</button>
            <button className="btn-secondary px-3 py-1.5 text-sm" onClick={onToggle}>{room.isActive ? 'Disable' : 'Enable'}</button>
            <button className="btn-secondary px-2.5 py-1.5 text-sm" onClick={() => onMove('up')} disabled={isFirst} aria-label={`Move ${room.name} up in priority`}>↑</button>
            <button className="btn-secondary px-2.5 py-1.5 text-sm" onClick={() => onMove('down')} disabled={isLast} aria-label={`Move ${room.name} down in priority`}>↓</button>
            {room.used === 0 && (
              <ConfirmButton className="btn-danger px-3 py-1.5 text-sm" confirmText={`Remove ${room.name}?`} onConfirm={onDelete}>Remove</ConfirmButton>
            )}
          </div>
        )}
      </header>

      {teams.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teams.map((t) => (
            <div key={t.id} id={`team-${t.id}`}>
              <TeamCard team={t} prefix={prefix} roomName={room.name} highlight={highlight} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-niat-warm-white px-4 py-3 text-sm text-niat-muted">
          {tablesBuilt
            ? 'No tables yet.'
            : `${plural(room.completeTeams, 'team')} of ${room.teamSize}${room.partialSeats ? ` + 1 table of ${room.partialSeats}` : ''} will be created at activation, numbered from ${prefix} 1.`}
        </p>
      )}
    </section>
  );
}

const ACTION_TEXT: Record<string, string> = {
  'room.created': 'Room added',
  'room.updated': 'Room updated',
  'room.reordered': 'Priority changed',
  'room.deleted': 'Room removed',
  'allocation.waiting': 'Auto-allocated',
};

function ChangeLog({ log, rooms }: { log: RoomsOverview['log']; rooms: OverviewRoom[] }) {
  const roomName = (id?: number) => rooms.find((r) => r.id === id)?.name ?? 'Room';
  const describe = (l: RoomsOverview['log'][0]) => {
    const d = l.details;
    switch (l.action) {
      case 'room.created': return `${d.name} · ${d.capacity} seats`;
      case 'room.updated': {
        const parts: string[] = [];
        if (d.before?.capacity !== d.after?.capacity) parts.push(`capacity ${d.before?.capacity} → ${d.after?.capacity}`);
        if (d.before?.isActive !== d.after?.isActive) parts.push(d.after?.isActive ? 'enabled' : 'disabled');
        if (d.before?.priority !== d.after?.priority) parts.push(`priority ${d.before?.priority} → ${d.after?.priority}`);
        if (d.before?.name !== d.after?.name) parts.push(`renamed from ${d.before?.name}`);
        return `${d.after?.name ?? roomName(d.roomId)}${parts.length ? ` · ${parts.join(', ')}` : ''}`;
      }
      case 'room.reordered': return `${roomName(d.roomId)} · priority ${d.from} → ${d.to}`;
      case 'room.deleted': return d.name;
      case 'allocation.waiting': return `${plural(d.allocated, 'student')} seated${d.stillWaiting ? `, ${d.stillWaiting} still waiting` : ''}`;
      default: return '';
    }
  };
  return (
    <section aria-label="Recent allocation changes" className="mt-8">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-niat-muted">Recent changes</h2>
      <ul className="mt-2 divide-y divide-niat-line/60 rounded-xl border border-niat-line bg-white text-sm">
        {log.map((l) => (
          <li key={l.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
            <span className="font-semibold">{ACTION_TEXT[l.action] ?? l.action}</span>
            <span className="min-w-0 flex-1 text-niat-muted">{describe(l)}</span>
            <span className="text-xs tabular-nums text-niat-muted">{formatTime(l.createdAt)}{l.createdBy ? ` · ${l.createdBy}` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
