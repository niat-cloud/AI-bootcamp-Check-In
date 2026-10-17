import { duration, minutesSince, pct, plural, type DashboardData } from './data';
import { Card, Empty, PageLink } from './ui';

/** Seats used per room, in the order rooms fill. */
export function RoomCapacity({ data, className = '' }: { data: DashboardData; className?: string }) {
  return (
    <Card title="Rooms" subtitle="Seats used in each room. Rooms fill in priority order." className={className}
      actions={<PageLink to="/admin/teams">Rooms & Teams</PageLink>}>
      {data.rooms.length === 0 ? (
        <Empty>No rooms yet. Add them in Event Setup.</Empty>
      ) : (
        <ul className="space-y-4">
          {data.rooms.map((r) => {
            const left = Math.max(0, r.capacity - r.used);
            return (
              <li key={r.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-niat-text">{r.name}</span>
                    <span className="shrink-0 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs text-niat-muted">Priority {r.priority}</span>
                    {!r.isActive && <span className="shrink-0 rounded-md bg-stone-700 px-1.5 py-0.5 text-xs font-semibold text-white">Closed</span>}
                  </span>
                  <span className="shrink-0 text-sm text-niat-muted tabular-nums">
                    <strong className="font-semibold text-niat-text">{r.used}</strong> / {r.capacity}
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full rounded bg-niat-maroon/10" aria-hidden="true">
                  <div className={`h-full rounded transition-[width] duration-500 ${r.isActive ? 'bg-niat-maroon' : 'bg-stone-400'}`}
                    style={{ width: `${r.capacity ? Math.min(100, (r.used / r.capacity) * 100) : 0}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-niat-muted">
                  {left === 0 ? 'Full' : `${plural(left, 'seat')} left`} · {pct(r.used, r.capacity)}% used
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** People who arrived while every seat was taken, longest wait first. */
export function WaitingList({ data, now, className = '' }: { data: DashboardData; now: number; className?: string }) {
  const { waiting } = data.stats;
  return (
    <Card title="Waiting for a seat" className={className}
      subtitle={waiting > 0 ? `${plural(waiting, 'person', 'people')} arrived with no free seat` : 'People who arrive when every seat is taken appear here'}
      actions={waiting > 0 && <PageLink to="/admin/teams">Add seats</PageLink>}>
      {waiting === 0 ? (
        <Empty>No one is waiting. Everyone who arrived has a seat.</Empty>
      ) : (
        <>
          <ol className="-mx-2 divide-y divide-niat-line/70">
            {data.waiting.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-niat-text">
                    {p.name}
                    {p.registrationType === 'walk_in' && <span className="ml-2 rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-normal text-niat-muted">Walk-in</span>}
                  </p>
                  {p.schoolCollege && <p className="truncate text-sm text-niat-muted">{p.schoolCollege}</p>}
                </div>
                <span className="shrink-0 text-sm text-niat-muted tabular-nums">
                  {p.arrivedAt ? <>waiting <strong className="font-semibold text-niat-text">{duration(minutesSince(p.arrivedAt, now))}</strong></> : ''}
                </span>
              </li>
            ))}
          </ol>
          {waiting > data.waiting.length && (
            <p className="mt-2 text-sm text-niat-muted">and {plural(waiting - data.waiting.length, 'more person', 'more people')}</p>
          )}
        </>
      )}
    </Card>
  );
}
