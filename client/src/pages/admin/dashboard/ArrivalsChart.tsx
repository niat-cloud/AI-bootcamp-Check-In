import { useEffect, useRef, useState } from 'react';
import { clock, plural, type DashboardData } from './data';
import { Card, Empty } from './ui';

/** Clean axis ticks: 0 and up to four steps of 1, 2 or 5 × 10ⁿ covering `max`. */
function ticks(max: number) {
  const raw = Math.max(1, max) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

export function ArrivalsChart({ data, now, className = '' }: { data: DashboardData; now: number; className?: string }) {
  const { bucketMinutes, buckets } = data.arrivals;
  const live = data.event.status === 'active';
  const [hover, setHover] = useState<number | null>(null);
  // Time labels need about 72px each, so how many fit depends on the chart's width.
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(600);
  const hasData = buckets.length > 0;
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setPlotWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasData]);
  const step = bucketMinutes * 60_000;
  const end = (start: string) => Date.parse(start) + step;

  if (!hasData) {
    return (
      <Card title="Arrivals over time" subtitle="People arriving at the venue, per time slot" className={className}>
        <Empty>No one has arrived yet. Arrivals appear here as people check in.</Empty>
      </Card>
    );
  }

  const axis = ticks(Math.max(...buckets.map((b) => b.count)));
  const top = axis[axis.length - 1];
  const labelEvery = Math.ceil(buckets.length / Math.max(2, Math.floor(plotWidth / 72)));
  const currentSlot = live ? buckets.find((b) => now < end(b.start)) : undefined;
  const busiest = buckets.reduce((best, b) => (b.count > best.count ? b : best), buckets[0]);
  const shown = hover !== null ? buckets[hover] : null;

  return (
    <Card title="Arrivals over time" className={className}
      subtitle={`People arriving at the venue, per ${bucketMinutes} minutes`}
      actions={<span className="text-sm text-niat-muted"><strong className="font-semibold text-niat-text">+{data.stats.arrivedLast15Min}</strong> in the last 15 min</span>}>
      <div className="flex gap-2">
        {/* Y axis */}
        <div className="relative h-48 w-8 shrink-0 text-right text-xs text-niat-muted tabular-nums" aria-hidden="true">
          {axis.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / top) * 100}%` }}>{t}</span>
          ))}
        </div>

        <div ref={plotRef} className="min-w-0 flex-1">
          <div className="relative h-48" onMouseLeave={() => setHover(null)}>
            {axis.map((t) => (
              <div key={t} className={`absolute inset-x-0 h-px ${t === 0 ? 'bg-stone-300' : 'bg-stone-100'}`} style={{ bottom: `${(t / top) * 100}%` }} aria-hidden="true" />
            ))}
            <ol className="absolute inset-0 flex items-end gap-0.5" aria-label="Arrivals per time slot">
              {buckets.map((b, i) => {
                const current = live && now < end(b.start);
                return (
                  <li key={b.start} className="relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                    tabIndex={0} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                    aria-label={`${clock(b.start)} to ${clock(end(b.start))}: ${plural(b.count, 'arrival')}${current ? ', still counting' : ''}`}>
                    <div className={`w-full max-w-6 rounded-t transition-[height] duration-500 ${current ? 'bg-niat-maroon/45' : 'bg-niat-maroon'} ${hover === i ? 'opacity-80' : ''}`}
                      style={{ height: `${(b.count / top) * 100}%` }} />
                  </li>
                );
              })}
            </ol>
            {shown && hover !== null && (
              <div role="status" className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-niat-text px-2.5 py-1.5 text-xs text-white shadow-lg"
                style={{ left: `${((hover + 0.5) / buckets.length) * 100}%` }}>
                <strong className="font-semibold">{plural(shown.count, 'arrival')}</strong> · {clock(shown.start)}–{clock(end(shown.start))}
                {live && now < end(shown.start) && ' · still counting'}
              </div>
            )}
          </div>

          {/* X axis: a few evenly spaced slot start times. */}
          <div className="relative mt-2 h-4 text-xs text-niat-muted" aria-hidden="true">
            {buckets.map((b, i) => i % labelEvery === 0 && (
              <span key={b.start} className={`absolute whitespace-nowrap ${i === 0 ? '' : '-translate-x-1/2'}`}
                style={{ left: i === 0 ? 0 : `${((i + 0.5) / buckets.length) * 100}%` }}>
                {clock(b.start)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <dl className="mt-5 grid gap-4 border-t border-niat-line pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold text-niat-muted">Busiest slot</dt>
          <dd className="mt-0.5 text-sm text-niat-text">
            {clock(busiest.start)}–{clock(end(busiest.start))} · <strong className="font-semibold">{plural(busiest.count, 'arrival')}</strong>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-niat-muted">{live ? 'Forecast' : 'Last arrival'}</dt>
          <dd className="mt-0.5 text-sm text-niat-text">{live ? forecast(data, now) : data.stats.lastArrivalAt ? clock(data.stats.lastArrivalAt) : '—'}</dd>
        </div>
      </dl>
      {currentSlot && currentSlot.count > 0 && (
        <p className="mt-3 text-xs text-niat-muted">The lighter column is the current slot ({clock(currentSlot.start)}), still counting.</p>
      )}
    </Card>
  );
}

/** When the remaining seats fill at the pace of the last 15 minutes. */
function forecast({ stats: s }: DashboardData, now: number) {
  const perMinute = s.arrivedLast15Min / 15;
  if (s.capacity === 0) return 'Add rooms to forecast seating.';
  if (s.seatsLeft === 0) return 'Every seat is taken.';
  if (s.notArrived < s.seatsLeft) {
    return `Enough seats for the ${plural(s.notArrived, 'registered person', 'registered people')} still to come, with ${s.seatsLeft - s.notArrived} spare for walk-ins.`;
  }
  if (perMinute === 0) return 'No arrivals in the last 15 minutes, so there’s no pace to forecast from.';
  return `At ${perMinute.toFixed(1)} arrivals a minute, the last ${plural(s.seatsLeft, 'seat')} fill around ${clock(now + (s.seatsLeft / perMinute) * 60_000)}.`;
}
