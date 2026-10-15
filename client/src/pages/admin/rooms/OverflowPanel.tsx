import { formatTime } from '../../../lib/api';
import { plural, type RoomsOverview } from './types';

/**
 * Students who arrived while every approved seat was taken, plus the capacity that could seat them.
 * Only real, configured rooms are offered.
 */
export function OverflowPanel({ data, canEdit, allocating, onAllocate, onAddRoom, onEditRoom }: {
  data: RoomsOverview;
  canEdit: boolean;
  allocating: boolean;
  onAllocate: () => void;
  onAddRoom: () => void;
  onEditRoom: (roomId: number) => void;
}) {
  const { stats, waiting } = data;
  if (stats.waiting === 0) return null;

  const roomsWithSpace = data.rooms.filter((r) => r.isActive && r.available > 0);
  const disabledWithSpace = data.rooms.filter((r) => !r.isActive && r.available > 0);
  const canSeatNow = Math.min(stats.waiting, stats.availableSeats);

  return (
    <section aria-labelledby="overflow-title" className="mt-6 overflow-hidden rounded-2xl border border-niat-maroon/25 bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-niat-maroon/15 bg-niat-pink/60 px-5 py-4">
        <div className="flex gap-3">
          <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-niat-maroon text-lg font-bold text-white">!</span>
          <div>
            <h2 id="overflow-title" className="text-lg font-extrabold text-niat-text">
              {plural(stats.waiting, 'student')} waiting for a seat
            </h2>
            <p className="mt-0.5 text-sm text-niat-muted">
              {stats.shortage > 0 ? (
                <>
                  Only {plural(stats.availableSeats, 'free seat')} in enabled rooms.{' '}
                  <strong className="text-niat-maroon">{plural(stats.shortage, 'more approved seat')} needed.</strong>
                </>
              ) : (
                <>Enough free seats exist. Auto-Allocate seats them in arrival order; nobody already seated is moved.</>
              )}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {canSeatNow > 0 && (
              <button className="btn-primary" onClick={onAllocate} disabled={allocating}>
                {allocating ? 'Allocating…' : `Seat ${plural(canSeatNow, 'student')} now`}
              </button>
            )}
            <button className="btn-secondary" onClick={onAddRoom}>+ Add Room</button>
          </div>
        )}
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-niat-muted">In arrival order</h3>
          <ol className="mt-2 max-h-64 divide-y divide-niat-line/70 overflow-y-auto rounded-xl border border-niat-line">
            {waiting.map((w, i) => (
              <li key={w.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 text-right font-mono text-xs text-niat-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold" title={w.name}>{w.name}</span>
                  <span className="block truncate text-xs text-niat-muted" title={w.schoolCollege}>{w.schoolCollege || '—'}</span>
                </span>
                {w.registrationType === 'walk_in' && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">Walk-in</span>
                )}
                <span className="shrink-0 text-xs tabular-nums text-niat-muted">{formatTime(w.arrivedAt)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-niat-muted">Capacity you can use</h3>
          {roomsWithSpace.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {roomsWithSpace.map((r) => (
                <li key={r.id} className="flex justify-between rounded-lg bg-niat-warm-white px-3 py-2">
                  <span className="font-semibold">{r.name}</span>
                  <span className="tabular-nums text-niat-muted">{plural(r.available, 'free seat')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 rounded-lg bg-niat-warm-white px-3 py-2 text-sm text-niat-muted">Every enabled room is full.</p>
          )}
          {disabledWithSpace.length > 0 && (
            <p className="mt-2 text-xs text-niat-muted">
              Disabled rooms with space: {disabledWithSpace.map((r) => `${r.name} (${r.available})`).join(', ')}. Enable one to use it.
            </p>
          )}
          {canEdit && (
            <div className="mt-4 space-y-2 text-sm">
              <p className="font-semibold text-niat-text">To make room:</p>
              <ol className="list-decimal space-y-1 pl-5 text-niat-muted">
                <li><button className="font-semibold text-niat-maroon underline-offset-2 hover:underline" onClick={onAddRoom}>Add a room</button> with approved seats, or</li>
                <li>
                  Raise an existing room's approved capacity:{' '}
                  {data.rooms.map((r, i) => (
                    <span key={r.id}>
                      <button className="font-semibold text-niat-maroon underline-offset-2 hover:underline" onClick={() => onEditRoom(r.id)}>{r.name}</button>
                      {i < data.rooms.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </li>
                <li>Then run Auto-Allocate. Existing seats stay as they are.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
