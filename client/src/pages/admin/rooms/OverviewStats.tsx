import type { RoomsOverview } from './types';

/** Compact attendance and capacity summary. Every student is counted once. */
export function OverviewStats({ stats }: { stats: RoomsOverview['stats'] }) {
  const arrivalsVsExpected = stats.arrivals - stats.expected;
  const tiles = [
    { label: 'Expected', value: stats.expected, hint: 'Planning estimate' },
    { label: 'Registered', value: stats.participants, hint: `${stats.registered} imported · ${stats.walkIns} walk-in` },
    {
      label: 'Arrived',
      value: stats.arrivals,
      hint: arrivalsVsExpected > 0 ? `${arrivalsVsExpected} above expected` : `${stats.notArrived} not arrived yet`,
      tone: arrivalsVsExpected > 0 ? 'text-amber-800' : undefined,
    },
    { label: 'Seated', value: stats.assigned, hint: 'Have a seat', tone: 'text-emerald-700' },
    {
      label: 'Awaiting seat',
      value: stats.waiting,
      hint: stats.waiting ? 'Arrived, no seat yet' : 'Nobody waiting',
      tone: stats.waiting ? 'text-niat-maroon' : undefined,
    },
    {
      label: 'Approved seats',
      value: stats.approvedCapacity,
      hint: stats.disabledCapacity ? `+${stats.disabledCapacity} in disabled rooms` : 'Enabled rooms',
    },
    { label: 'Free seats', value: stats.availableSeats, hint: 'Ready to allocate' },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-niat-line bg-white px-4 py-3 shadow-[var(--shadow-card)]">
          <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-niat-muted">{t.label}</dt>
          <dd className={`mt-1 text-2xl font-extrabold tabular-nums ${t.tone ?? 'text-niat-text'}`}>{t.value.toLocaleString('en-IN')}</dd>
          <dd className="mt-0.5 truncate text-xs text-niat-muted" title={t.hint}>{t.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
