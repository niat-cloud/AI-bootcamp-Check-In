import { useState } from 'react';
import { ago, clock, plural, type DashboardData } from './data';
import { Card, Empty, PageLink, Segmented } from './ui';

/** The latest (or first) people given a seat. */
export function LiveFeed({ data, now, className = '' }: { data: DashboardData; now: number; className?: string }) {
  const [view, setView] = useState<'latest' | 'first'>('latest');
  const [room, setRoom] = useState('all');
  const list = (view === 'latest' ? data.recentActivity : data.firstCheckIns)
    .filter((p) => room === 'all' || p.roomName === room);

  return (
    <Card title="Live check-ins" subtitle={`${plural(data.stats.seated, 'person', 'people')} seated so far`} className={className}
      actions={
        <>
          <Segmented label="Show" value={view} onChange={setView}
            options={[{ value: 'latest', label: 'Latest' }, { value: 'first', label: 'First 5' }]} />
          {data.rooms.length > 1 && (
            <select aria-label="Room" value={room} onChange={(e) => setRoom(e.target.value)}
              className="rounded-lg border border-niat-line bg-white px-2 py-1 text-xs font-semibold text-niat-text">
              <option value="all">All rooms</option>
              {data.rooms.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
          )}
        </>
      }>
      {list.length === 0 ? (
        <Empty>{data.stats.seated === 0 ? 'No one has been seated yet.' : 'No one in this room is in the list.'}</Empty>
      ) : (
        <ol className="-mx-2 max-h-[26rem] min-h-0 flex-1 divide-y divide-niat-line/70 overflow-y-auto lg:max-h-none">
          {list.map((p, i) => (
            <li key={p.id} className="flex items-start gap-3 px-2 py-2.5">
              {view === 'first' ? (
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-niat-cream text-xs font-bold text-niat-maroon">{i + 1}</span>
              ) : (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-niat-text">{p.name}</span>
                  <span className="shrink-0 text-xs text-niat-muted tabular-nums">
                    {view === 'first' ? (p.checkInTime ? clock(p.checkInTime) : '') : ago(p.checkInTime, now)}
                  </span>
                </div>
                <p className="truncate text-sm text-niat-muted">
                  {p.teamNumber && <strong className="font-semibold text-niat-text">Seat {p.teamNumber}{p.seatLabel}</strong>}
                  {p.roomName && <> · {p.roomName}</>}
                  {p.schoolCollege && <> · {p.schoolCollege}</>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 border-t border-niat-line pt-3">
        <PageLink to="/admin/participants?filter=checked_in">Everyone checked in</PageLink>
      </div>
    </Card>
  );
}
