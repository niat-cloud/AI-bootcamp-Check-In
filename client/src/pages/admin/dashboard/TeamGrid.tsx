import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { plural, type DashboardData, type Team } from './data';
import { Card, Empty, PageLink, Segmented } from './ui';

type Filter = 'all' | 'filling' | 'full' | 'empty';

const stateOf = (t: Team): Exclude<Filter, 'all'> =>
  t.assigned >= t.capacity ? 'full' : t.assigned > 0 ? 'filling' : 'empty';

/** Every table, grouped by room (team numbers restart in each room). */
export function TeamGrid({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState<Filter>('all');
  // Kept by id, so the open dialog follows live updates.
  const [openId, setOpenId] = useState<number | null>(null);
  const open = data.teams.find((t) => t.id === openId);
  const close = useCallback(() => setOpenId(null), []);
  const count = (f: Filter) => data.teams.filter((t) => f === 'all' || stateOf(t) === f).length;
  const roomName = (id: number) => data.rooms.find((r) => r.id === id)?.name ?? '';

  return (
    <Card title="Team tables"
      subtitle={data.teams.length ? `${plural(data.teams.length, 'table')} in ${plural(data.rooms.length, 'room')}` : undefined}
      actions={
        <>
          <Segmented label="Show tables" value={filter} onChange={setFilter} options={[
            { value: 'all', label: `All ${count('all')}` },
            { value: 'filling', label: `Filling ${count('filling')}` },
            { value: 'full', label: `Full ${count('full')}` },
            { value: 'empty', label: `Empty ${count('empty')}` },
          ]} />
          <PageLink to="/admin/teams">Seat table</PageLink>
        </>
      }>
      {data.teams.length === 0 ? (
        <Empty>Tables are created when the event is activated.</Empty>
      ) : count(filter) === 0 ? (
        <Empty>No tables match this filter.</Empty>
      ) : (
        <div className="space-y-6">
          {data.rooms.map((room) => {
            const teams = data.teams.filter((t) => t.roomId === room.id);
            const shown = teams.filter((t) => filter === 'all' || stateOf(t) === filter);
            if (shown.length === 0) return null;
            const seated = teams.reduce((n, t) => n + t.assigned, 0);
            const seats = teams.reduce((n, t) => n + t.capacity, 0);
            return (
              <section key={room.id} aria-label={room.name}>
                <h3 className="flex items-baseline justify-between gap-3 border-b border-niat-line pb-2">
                  <span className="text-sm font-semibold text-niat-text">{room.name}</span>
                  <span className="text-sm text-niat-muted tabular-nums">{seated} / {seats} seated</span>
                </h3>
                <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
                  {shown.map((t) => <TeamTile key={t.id} team={t} onOpen={() => setOpenId(t.id)} />)}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {open && <TeamDialog team={open} roomName={roomName(open.roomId)} onClose={close} />}
    </Card>
  );
}

const TILE: Record<Exclude<Filter, 'all'>, { box: string; bar: string; dot: string }> = {
  full: { box: 'border-emerald-300 bg-emerald-50/60', bar: 'bg-emerald-600', dot: 'bg-emerald-600' },
  filling: { box: 'border-niat-gold/60 bg-niat-cream/60', bar: 'bg-niat-maroon', dot: 'bg-niat-gold' },
  empty: { box: 'border-niat-line bg-white', bar: 'bg-transparent', dot: 'bg-stone-300' },
};

function TeamTile({ team: t, onOpen }: { team: Team; onOpen: () => void }) {
  const state = stateOf(t);
  const style = TILE[state];
  return (
    <li>
      <button type="button" onClick={onOpen}
        className={`flex w-full cursor-pointer flex-col rounded-xl border p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 ${style.box}`}>
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-niat-text">Team {t.teamNumber}</span>
          <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
        </span>
        <span className="mt-1 text-lg font-bold text-niat-text tabular-nums">
          {t.assigned}<span className="text-sm font-normal text-niat-muted"> / {t.capacity}</span>
        </span>
        <span className="mt-2 h-1.5 w-full rounded-full bg-stone-200" aria-hidden="true">
          <span className={`block h-full rounded-full ${style.bar}`} style={{ width: `${(t.assigned / t.capacity) * 100}%` }} />
        </span>
        <span className="mt-1.5 text-xs text-niat-muted">
          {state === 'full' ? 'Full' : state === 'filling' ? `${t.capacity - t.assigned} open` : 'Empty'}
        </span>
      </button>
    </li>
  );
}

function TeamDialog({ team, roomName, onClose }: { team: Team; roomName: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="team-dialog-title"
        className="w-full max-w-sm animate-scale-in rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="team-dialog-title" className="text-lg font-bold text-niat-text">Team {team.teamNumber}</h3>
            <p className="text-sm text-niat-muted">{roomName} · {team.assigned} of {team.capacity} seats taken</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full text-xl text-niat-muted hover:bg-niat-pink hover:text-niat-maroon">
            ×
          </button>
        </div>
        <ul className="mt-4 divide-y divide-niat-line rounded-xl border border-niat-line">
          {team.seats.map((s) => (
            <li key={s.label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="font-semibold text-niat-maroon">Seat {team.teamNumber}{s.label}</span>
              <span className={s.student ? 'truncate text-niat-text' : 'text-niat-muted'}>{s.student ?? 'Open'}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Link to="/admin/teams" className="btn-secondary px-3 py-1.5 text-sm">Open Rooms & Teams</Link>
          <button type="button" onClick={onClose} className="btn-primary px-3 py-1.5 text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
