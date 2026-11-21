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
    <Card title="Seat map"
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
        <div className="space-y-4">
          {data.rooms.map((room) => {
            const teams = data.teams.filter((t) => t.roomId === room.id);
            const shown = teams.filter((t) => filter === 'all' || stateOf(t) === filter);
            if (shown.length === 0) return null;
            const seated = teams.reduce((n, t) => n + t.assigned, 0);
            const seats = teams.reduce((n, t) => n + t.capacity, 0);
            return (
              <section key={room.id} aria-label={room.name}>
                <h3 className="flex items-baseline justify-between gap-3 pb-2">
                  <span className="text-[13px] font-semibold text-niat-text">{room.name}</span>
                  <span className="text-[13px] text-niat-muted tabular-nums">{seated} / {seats} seated</span>
                </h3>
                {/* A seat map: one small tile per table, one dot per seat. A whole room fits on a laptop row or two. */}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
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

const TILE: Record<Exclude<Filter, 'all'>, string> = {
  full: 'border-emerald-300 bg-emerald-50 hover:border-emerald-500',
  filling: 'border-niat-gold/70 bg-niat-cream/70 hover:border-niat-gold',
  empty: 'border-niat-line bg-white hover:border-niat-maroon/30',
};

function TeamTile({ team: t, onOpen }: { team: Team; onOpen: () => void }) {
  const state = stateOf(t);
  return (
    <li>
      <button type="button" onClick={onOpen}
        title={`Team ${t.teamNumber}: ${t.assigned} of ${t.capacity} seated`}
        aria-label={`Team ${t.teamNumber}, ${t.assigned} of ${t.capacity} seated`}
        className={`flex w-full cursor-pointer flex-col items-center rounded-lg border px-1 pb-1.5 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 ${TILE[state]}`}>
        <span className="text-[12px] font-bold text-niat-text tabular-nums">{t.teamNumber}</span>
        <span className="mt-1 flex flex-wrap justify-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: t.capacity }, (_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${
              i < t.assigned ? (state === 'full' ? 'bg-emerald-600' : 'bg-niat-maroon') : 'bg-stone-300'}`} />
          ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/40 p-4 animate-fade-in" onClick={onClose}>
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
