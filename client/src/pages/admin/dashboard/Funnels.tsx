import { Link } from 'react-router-dom';
import { pct, plural, type Breakdown, type SourceRow } from './data';
import { Card, Empty, RegisteredArrivedBar } from './ui';

/** Fewer registrations than this make a show-up rate too noisy to call a source best or worst. */
const MIN_FOR_RANKING = 5;

const rate = (r: { registered: number; arrived: number }) => (r.registered ? r.arrived / r.registered : 0);

/**
 * Registered → arrived per marketing source, best show-up rate first. Walk-ins are listed apart: they
 * register at the venue, so they always count as arrived. Picking a source opens its call list.
 */
export function SourcePerformance({ sources, withoutSource, onPick }: {
  sources: SourceRow[];
  withoutSource: number;
  onPick: (key: string) => void;
}) {
  const ranked = sources.filter((s) => s.kind !== 'walk_in').sort((a, b) => rate(b) - rate(a) || b.registered - a.registered);
  const walkIn = sources.find((s) => s.kind === 'walk_in');
  const comparable = ranked.filter((s) => s.kind === 'source' && s.registered >= MIN_FOR_RANKING);
  const registered = ranked.reduce((n, s) => n + s.registered, 0);
  const arrived = ranked.reduce((n, s) => n + s.arrived, 0);
  const max = Math.max(1, ...sources.map((s) => s.registered));

  return (
    <Card title="Source performance"
      subtitle={registered > 0
        ? `${arrived.toLocaleString('en-IN')} of ${plural(registered, 'imported registration')} arrived · ${pct(arrived, registered)}% show-up`
        : 'Which channels bring people to the event'}
      actions={comparable.length >= 2 && (
        <dl className="flex flex-wrap gap-2 text-sm">
          <Highlight label="Best show-up" row={comparable[0]} />
          <Highlight label="Lowest show-up" row={comparable[comparable.length - 1]} />
        </dl>
      )}>
      {sources.length === 0 ? (
        <Empty>No registrations yet. Import a list with a Source column to see which channels bring people in.</Empty>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5rem_4rem_6rem] gap-4 border-b border-niat-line pb-2 text-xs font-semibold text-niat-muted sm:grid">
            <span>Source</span><span>Registered vs arrived</span>
            <span className="text-right">Arrived</span><span className="text-right">Show-up</span><span className="text-right">Not arrived</span>
          </div>
          <ul className="divide-y divide-niat-line/70">
            {ranked.map((s) => <SourceLine key={s.key} row={s} max={max} onPick={onPick} />)}
          </ul>
          {walkIn && (
            <div className="mt-2 border-t border-niat-line pt-1">
              <ul><SourceLine row={walkIn} max={max} /></ul>
              <p className="text-xs text-niat-muted">Walk-ins register at the venue, so they always count as arrived.</p>
            </div>
          )}
        </div>
      )}
      {withoutSource > 0 && (
        <p className="mt-4 rounded-xl bg-niat-warm-white px-4 py-3 text-sm text-niat-muted">
          {plural(withoutSource, 'imported registration has', 'imported registrations have')} no source and {withoutSource === 1 ? 'shows' : 'show'} as “Not specified”.{' '}
          <Link to="/admin/import" className="font-semibold text-niat-maroon hover:underline">Re-import with a Source column</Link> to fill it in.
        </p>
      )}
    </Card>
  );
}

function Highlight({ label, row }: { label: string; row: SourceRow }) {
  return (
    <div className="rounded-lg bg-niat-warm-white px-3 py-1.5">
      <dt className="text-xs text-niat-muted">{label}</dt>
      <dd className="font-semibold text-niat-text">{row.source} · {pct(row.arrived, row.registered)}%</dd>
    </div>
  );
}

function SourceLine({ row: s, max, onPick }: { row: SourceRow; max: number; onPick?: (key: string) => void }) {
  const missing = s.registered - s.arrived;
  const name = onPick && missing > 0 ? (
    <button type="button" onClick={() => onPick(s.key)} title={`Show the ${missing} people from ${s.source} who haven't arrived`}
      className="cursor-pointer truncate text-left text-sm font-semibold text-niat-text underline decoration-niat-line underline-offset-4 hover:text-niat-maroon hover:decoration-niat-maroon">
      {s.source}
    </button>
  ) : <span className="truncate text-sm font-semibold text-niat-text">{s.source}</span>;

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5rem_4rem_6rem]">
      {name}
      <span className="text-right text-sm text-niat-muted tabular-nums sm:hidden">
        {s.arrived} / {s.registered} · <strong className="font-semibold text-niat-text">{pct(s.arrived, s.registered)}%</strong>
      </span>
      <div className="col-span-2 sm:col-span-1"><RegisteredArrivedBar registered={s.registered} arrived={s.arrived} max={max} /></div>
      <span className="hidden text-right text-sm text-niat-muted tabular-nums sm:block">{s.arrived} / {s.registered}</span>
      <span className="hidden text-right text-sm font-semibold text-niat-text tabular-nums sm:block">{pct(s.arrived, s.registered)}%</span>
      <span className="hidden text-right text-sm text-niat-muted tabular-nums sm:block">{missing}</span>
    </li>
  );
}

/** Registered → arrived for the top groups of a free-text column (areas, schools). */
export function BreakdownCard({ title, subtitle, data, empty, othersLabel, missingLabel }: {
  title: string;
  subtitle: string;
  data: Breakdown;
  empty: string;
  othersLabel: string;
  missingLabel: string;
}) {
  const max = Math.max(1, ...data.rows.map((r) => r.registered));
  const extra = [
    data.others.count > 0 && { label: `${data.others.count} more ${othersLabel}`, ...data.others },
    data.missing.registered > 0 && { label: missingLabel, ...data.missing },
  ].filter(Boolean) as { label: string; registered: number; arrived: number }[];

  return (
    <Card title={title} subtitle={subtitle}>
      {data.rows.length === 0 ? <Empty>{empty}</Empty> : (
        <ol className="space-y-3.5">
          {data.rows.map((r, i) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="w-4 shrink-0 text-right text-xs text-niat-muted tabular-nums">{i + 1}</span>
                  <span className="truncate text-sm font-semibold text-niat-text" title={r.label}>{r.label}</span>
                </span>
                <span className="shrink-0 text-sm text-niat-muted tabular-nums">
                  <strong className="font-semibold text-niat-text">{r.arrived}</strong> / {r.registered} arrived
                </span>
              </div>
              <div className="mt-1.5 pl-6"><RegisteredArrivedBar registered={r.registered} arrived={r.arrived} max={max} /></div>
            </li>
          ))}
        </ol>
      )}
      {extra.length > 0 && (
        <div className="mt-auto pt-4">
          <dl className="space-y-1 border-t border-niat-line pt-3 text-sm text-niat-muted">
            {extra.map((e) => (
              <div key={e.label} className="flex justify-between gap-3">
                <dt>{e.label}</dt>
                <dd className="tabular-nums"><strong className="font-semibold text-niat-text">{e.arrived}</strong> / {e.registered} arrived</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Card>
  );
}
