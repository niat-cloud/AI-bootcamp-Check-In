import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { duration, minutesSince, pct, type DashboardData } from './data';
import { Legend } from './ui';

export function KpiRow({ data, now, showCallList }: { data: DashboardData; now: number; showCallList: () => void }) {
  const s = data.stats;
  const oldestWait = data.waiting[0]?.arrivedAt;
  const segments = [
    { value: s.seated, swatch: 'bg-niat-maroon', label: 'Seated' },
    { value: s.waiting, swatch: 'bg-amber-400', label: 'Waiting for a seat' },
    { value: s.notArrived, swatch: 'bg-stone-200', label: 'Not arrived' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
      <div className="card col-span-2 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-semibold text-niat-muted">Arrived</span>
          <span className="text-sm text-niat-muted">
            <strong className="font-semibold text-niat-text">+{s.arrivedLast15Min}</strong> in the last 15 min
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-5xl font-bold tracking-tight text-niat-text tabular-nums">{s.arrived.toLocaleString('en-IN')}</span>
          <span className="text-sm text-niat-muted">
            of {s.total.toLocaleString('en-IN')} registered · <strong className="font-semibold text-niat-text">{pct(s.arrived, s.total)}%</strong>
            {s.expected > 0 && <> · {pct(s.arrived, s.expected)}% of {s.expected.toLocaleString('en-IN')} expected</>}
          </span>
        </div>
        <div className="mt-auto pt-4">
          {/* Everyone registered, split by where they are now. */}
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded" role="img"
            aria-label={segments.map((g) => `${g.label}: ${g.value}`).join(', ')}>
            {s.total === 0 ? <div className="h-full w-full bg-stone-100" /> : segments.filter((g) => g.value > 0).map((g) => (
              <div key={g.label} className={`h-full transition-[width] duration-500 ${g.swatch}`} style={{ width: `${(g.value / s.total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2.5">
            <Legend items={segments.map((g) => ({
              swatch: g.swatch,
              label: <>{g.label} <strong className="font-semibold text-niat-text tabular-nums">{g.value.toLocaleString('en-IN')}</strong></>,
            }))} />
          </div>
        </div>
      </div>

      <Tile label="Not arrived" value={s.notArrived} hint="Registered, not here yet"
        action={s.notArrived > 0 && <button type="button" onClick={showCallList} className="cursor-pointer text-sm font-semibold text-niat-maroon hover:underline">Call list <span aria-hidden="true">→</span></button>} />
      <Tile label="Waiting for a seat" value={s.waiting} tone={s.waiting > 0 ? 'warn' : undefined}
        hint={s.waiting > 0 && oldestWait ? `Longest wait ${duration(minutesSince(oldestWait, now))}` : 'Everyone who arrived has a seat'}
        action={s.waiting > 0 && <Link to="/admin/teams" className="text-sm font-semibold text-niat-maroon hover:underline">Add seats <span aria-hidden="true">→</span></Link>} />
      <Tile label="Seats left" value={s.seatsLeft} hint={`of ${s.capacity.toLocaleString('en-IN')} seats in open rooms`}
        action={s.capacity > 0 && (
          <div className="h-1.5 w-full rounded-full bg-niat-maroon/15" aria-hidden="true">
            <div className="h-full rounded-full bg-niat-maroon transition-[width] duration-500" style={{ width: `${((s.capacity - s.seatsLeft) / s.capacity) * 100}%` }} />
          </div>
        )} />
      <Tile label="Walk-ins" value={s.walkIns} hint="Registered at the venue" />
    </div>
  );
}

function Tile({ label, value, hint, action, tone }: {
  label: string;
  value: number;
  hint: string;
  action?: ReactNode;
  tone?: 'warn';
}) {
  return (
    <div className={`card flex flex-col ${tone === 'warn' ? 'border-amber-300 bg-amber-50/50' : ''}`}>
      <span className="text-sm font-semibold text-niat-muted">{label}</span>
      <span className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${tone === 'warn' ? 'text-amber-800' : 'text-niat-text'}`}>
        {value.toLocaleString('en-IN')}
      </span>
      <span className="mt-1 text-sm text-niat-muted">{hint}</span>
      {action && <div className="mt-auto pt-3">{action}</div>}
    </div>
  );
}
