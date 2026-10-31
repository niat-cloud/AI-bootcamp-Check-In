import { clock, STATUS_LABEL, type ProjectRoom } from './types';

const statusTone: Record<ProjectRoom['status'], string> = {
  not_open: 'bg-stone-100 text-niat-muted',
  open: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300',
  closed: 'bg-niat-pink text-niat-maroon',
};

/**
 * One card per room: submission status, how many teams submitted and how many are scored, with quick
 * open/close. Clicking a card shows that room's ranking below.
 */
export function RoomBoard({ rooms, selectedId, onSelect, onStatus }: {
  rooms: ProjectRoom[];
  selectedId: number | undefined;
  onSelect: (id: number) => void;
  onStatus: (id: number, status: 'open' | 'closed', deadlineMinutes?: number | null) => void;
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rooms.map((r) => {
        const selected = r.id === selectedId;
        const locked = Boolean(r.resultsLockedAt);
        const submittedPct = r.teamCount ? (r.submittedCount / r.teamCount) * 100 : 0;
        const scoredPct = r.submittedCount ? (r.evaluatedCount / r.submittedCount) * 100 : 0;
        return (
          <div key={r.id} role="button" tabIndex={0} aria-pressed={selected}
            onClick={() => onSelect(r.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); } }}
            className={`card cursor-pointer p-4 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 ${selected ? 'border-niat-maroon ring-2 ring-niat-maroon/20' : 'hover:border-niat-maroon/40'}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-bold">{r.name}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${statusTone[r.status]}`}>
                {locked ? 'Results locked' : STATUS_LABEL[r.status]}
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div>
                <div className="flex justify-between font-semibold"><span>Submitted</span><span className="tabular-nums">{r.submittedCount}/{r.teamCount}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${submittedPct}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between font-semibold"><span>AI scored</span><span className="tabular-nums">{r.evaluatedCount}/{r.submittedCount}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-niat-maroon" style={{ width: `${scoredPct}%` }} /></div>
              </div>
            </div>

            <div className="mt-3 flex min-h-8 items-center justify-between gap-2">
              <span className={`text-xs ${r.deadlinePassed ? 'font-bold text-niat-maroon' : 'text-niat-muted'}`}>
                {r.deadline ? `Deadline ${clock(r.deadline)}${r.deadlinePassed ? ' (passed)' : ''}` : r.lateCount ? `${r.lateCount} late` : ''}
              </span>
              {!locked && (
                <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {r.status === 'open'
                    ? <button className="btn-danger px-2.5 py-1 text-xs" onClick={() => onStatus(r.id, 'closed')}>Close</button>
                    : <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => onStatus(r.id, 'open', 30)}>{r.status === 'closed' ? 'Reopen' : 'Open'} · 30 min</button>}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
