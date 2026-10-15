import { formatTime } from '../../../lib/api';
import { teamStatus, type OverviewTeam } from './types';

const STATUS = {
  full: { label: 'Full', icon: '✓', box: 'border-emerald-300 bg-emerald-50/40', badge: 'bg-emerald-100 text-emerald-800' },
  partial: { label: 'Filling', icon: '◐', box: 'border-niat-maroon/25 bg-white', badge: 'bg-niat-cream text-niat-maroon' },
  empty: { label: 'Empty', icon: '○', box: 'border-dashed border-niat-line bg-white', badge: 'bg-stone-100 text-niat-muted' },
} as const;

/** One physical table. Team numbers are room-local, so the room name travels with the card. */
export function TeamCard({ team, prefix, roomName, highlight }: { team: OverviewTeam; prefix: string; roomName: string; highlight?: number | null }) {
  const status = teamStatus(team);
  const s = STATUS[status];
  const filled = team.seats.filter((x) => x.student).length;

  return (
    <article aria-label={`${roomName}, ${prefix} ${team.teamNumber}: ${filled} of ${team.seats.length} seats filled`}
      className={`rounded-xl border p-3 ${s.box}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-niat-text">{prefix} {team.teamNumber}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${s.badge}`}>
          <span aria-hidden>{s.icon}</span>
          {s.label} · <span className="tabular-nums">{filled}/{team.seats.length}</span>
        </span>
      </header>
      <ul className="mt-2 space-y-0.5 text-sm">
        {team.seats.map((seat) => (
          <li key={seat.label}
            className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${seat.eventParticipantId && seat.eventParticipantId === highlight ? 'bg-niat-gold/30' : ''}`}>
            <span className="w-8 shrink-0 font-mono text-xs font-semibold text-niat-muted">{team.teamNumber}{seat.label}</span>
            {seat.student ? (
              <>
                <span className="min-w-0 flex-1 truncate font-medium" title={seat.student}>{seat.student}</span>
                <span className="shrink-0 text-[11px] text-emerald-700" title={seat.checkInTime ? `Checked in at ${formatTime(seat.checkInTime)}` : 'Checked in'}>
                  <span aria-hidden>✓</span><span className="sr-only">Checked in</span>
                  <span className="ml-0.5 hidden tabular-nums sm:inline">{formatTime(seat.checkInTime)}</span>
                </span>
              </>
            ) : (
              <span className="flex-1 text-xs italic text-niat-muted/70">Open seat</span>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
