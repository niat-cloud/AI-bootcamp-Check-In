import { plural, type OverviewRoom } from './types';

/** Jump straight to a room. "All rooms" keeps the full team grid. */
export function RoomNav({ rooms, selected, onSelect }: {
  rooms: OverviewRoom[];
  selected: number | 'all';
  onSelect: (id: number | 'all') => void;
}) {
  const totalUsed = rooms.reduce((n, r) => n + r.used, 0);
  const totalCap = rooms.reduce((n, r) => n + r.capacity, 0);

  return (
    <nav aria-label="Rooms" className="-mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-2">
      <RoomPill active={selected === 'all'} onClick={() => onSelect('all')} title="All rooms" sub={`${totalUsed}/${totalCap} seated`} />
      {rooms.map((r) => {
        const pct = r.capacity ? Math.min(100, Math.round((r.used / r.capacity) * 100)) : 0;
        return (
          <RoomPill
            key={r.id}
            active={selected === r.id}
            onClick={() => onSelect(r.id)}
            priority={r.priority}
            title={r.name}
            sub={`${r.used}/${r.capacity} · ${plural(r.available, 'free')} · ${plural(r.teamCount || r.completeTeams + (r.partialSeats ? 1 : 0), 'team')}`}
            pct={pct}
            disabled={!r.isActive}
          />
        );
      })}
    </nav>
  );
}

function RoomPill({ active, onClick, title, sub, priority, pct, disabled }: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  priority?: number;
  pct?: number;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-[168px] shrink-0 cursor-pointer rounded-xl border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 ${
        active ? 'border-niat-maroon bg-niat-maroon text-white' : 'border-niat-line bg-white hover:border-niat-maroon/40'}`}
    >
      <span className="flex items-center gap-2">
        {priority !== undefined && (
          <span className={`grid h-5 min-w-5 place-items-center rounded px-1 text-[10px] font-extrabold ${active ? 'bg-white/20' : 'bg-niat-cream text-niat-maroon'}`}
            title={`Allocation priority ${priority}`}>
            P{priority}
          </span>
        )}
        <span className="truncate text-sm font-bold">{title}</span>
        {disabled && (
          <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${active ? 'bg-white/20' : 'bg-stone-200 text-niat-muted'}`}>Disabled</span>
        )}
      </span>
      <span className={`mt-1 block text-xs tabular-nums ${active ? 'text-white/80' : 'text-niat-muted'}`}>{sub}</span>
      {pct !== undefined && (
        <span className={`mt-2 block h-1 overflow-hidden rounded-full ${active ? 'bg-white/25' : 'bg-niat-line/70'}`} aria-hidden>
          <span className={`block h-full rounded-full ${active ? 'bg-white' : pct >= 100 ? 'bg-emerald-600' : 'bg-niat-maroon'}`} style={{ width: `${pct}%` }} />
        </span>
      )}
    </button>
  );
}
