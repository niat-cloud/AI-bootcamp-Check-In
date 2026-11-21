import { StatTile } from '../dashboard/ui';
import type { RoomsOverview } from './types';

/** Compact attendance and capacity summary. Every student is counted once. */
export function OverviewStats({ stats }: { stats: RoomsOverview['stats'] }) {
  const arrivalsVsExpected = stats.arrivals - stats.expected;
  const tiles = [
    { label: 'Expected', value: stats.expected, hint: 'Planning estimate' },
    { label: 'Registered', value: stats.participants, hint: stats.walkIns ? `${stats.registered} imported · ${stats.walkIns} walk-ins` : `${stats.registered} imported` },
    {
      label: 'Arrived',
      value: stats.arrivals,
      hint: arrivalsVsExpected > 0 ? `${arrivalsVsExpected} above expected` : `${stats.notArrived} not arrived yet`,
      tone: arrivalsVsExpected > 0 ? 'warn' as const : undefined,
    },
    { label: 'Seated', value: stats.assigned, hint: 'Have a seat', tone: 'good' as const },
    {
      label: 'Awaiting seat',
      value: stats.waiting,
      hint: stats.waiting ? 'Arrived, no seat yet' : 'Nobody waiting',
      tone: stats.waiting ? 'alert' as const : undefined,
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
      {tiles.map((t) => <StatTile key={t.label} label={t.label} value={t.value.toLocaleString('en-IN')} hint={t.hint} tone={t.tone} />)}
    </dl>
  );
}
