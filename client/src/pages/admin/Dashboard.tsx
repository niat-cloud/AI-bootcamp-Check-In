import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDate } from '../../lib/api';
import { NoEvent, useAdmin } from './AdminLayout';
import { ArrivalsChart } from './dashboard/ArrivalsChart';
import { Attention } from './dashboard/Attention';
import { CallList } from './dashboard/CallList';
import { clock, useDashboard, useNow, type DashboardData } from './dashboard/data';
import { BreakdownCard, SourcePerformance } from './dashboard/Funnels';
import { KpiRow } from './dashboard/KpiRow';
import { LiveFeed } from './dashboard/LiveFeed';
import { RoomCapacity, WaitingList } from './dashboard/Rooms';
import { TeamGrid } from './dashboard/TeamGrid';
import { ARRIVED_SWATCH, Legend, REGISTERED_SWATCH } from './dashboard/ui';

type View = 'live' | 'marketing';

export default function Dashboard() {
  const { event, reload } = useAdmin();
  const isLive = event?.status === 'active';
  const { data, error, loadedAt, refresh } = useDashboard(event?.id, isLive);
  const now = useNow(15_000);
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'marketing' ? 'marketing' : 'live';
  const [callSource, setCallSource] = useState('');
  const [scrollToCalls, setScrollToCalls] = useState(false);
  const callListRef = useRef<HTMLDivElement>(null);

  const setView = useCallback((v: View) => {
    setParams(v === 'live' ? {} : { view: v }, { replace: true });
  }, [setParams]);

  /** Opens the Marketing tab at the call list, optionally for one source. */
  const showCallList = useCallback((sourceKey = '') => {
    setCallSource(sourceKey);
    setView('marketing');
    setScrollToCalls(true);
  }, [setView]);

  useEffect(() => {
    if (!scrollToCalls || view !== 'marketing' || !callListRef.current) return;
    callListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToCalls(false);
  }, [scrollToCalls, view, data]);

  if (!event) return <NoEvent />;

  return (
    <div className="space-y-5 pb-12">
      <header className="card flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-niat-text">{event.name}</h1>
            <StatusPill status={event.status} />
          </div>
          <p className="mt-1 text-sm text-niat-muted">
            {formatDate(event.date)}{event.time && ` · ${event.time}`}{event.locationName && ` · ${event.locationName}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Freshness live={isLive} error={error} loadedAt={loadedAt} />
          <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={() => { refresh(); reload(); }}>
            Refresh
          </button>
          {isLive && (
            <Link to={`/gate/${event.id}`} target="_blank" rel="noopener noreferrer" className="btn-primary px-3 py-2 text-sm">
              Open gate kiosk <span aria-hidden="true">↗</span>
            </Link>
          )}
        </div>
      </header>

      <div role="tablist" aria-label="Dashboard view" className="flex gap-1 border-b border-niat-line">
        {([['live', 'Live operations'], ['marketing', 'Marketing']] as const).map(([v, label]) => (
          <button key={v} role="tab" type="button" aria-selected={view === v} onClick={() => setView(v)}
            className={`-mb-px cursor-pointer border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              view === v ? 'border-niat-maroon text-niat-maroon' : 'border-transparent text-niat-muted hover:text-niat-text'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="card py-16 text-center text-sm text-niat-muted">
          {error ? `Couldn’t load the dashboard: ${error}` : 'Loading the dashboard…'}
        </div>
      ) : view === 'live' ? (
        <LiveView data={data} now={now} showCallList={() => showCallList()} />
      ) : (
        <div role="tabpanel" aria-label="Marketing" className="space-y-5">
          <Legend items={[
            { swatch: REGISTERED_SWATCH, label: 'Registered' },
            { swatch: ARRIVED_SWATCH, label: 'Arrived' },
          ]} />
          <SourcePerformance sources={data.sources} withoutSource={data.stats.withoutSource} onPick={showCallList} />
          <div className="grid gap-5 lg:grid-cols-2">
            <BreakdownCard title="Top areas" subtitle="Where people are coming from" data={data.areas}
              empty="No areas yet. People give their area when they check in, or import it with an Area column."
              othersLabel="areas" missingLabel="Area not given yet" />
            <BreakdownCard title="Top schools and colleges" subtitle="Where people study" data={data.schools}
              empty="No schools or colleges yet." othersLabel="schools and colleges" missingLabel="School not given" />
          </div>
          <div ref={callListRef} className="scroll-mt-4">
            <CallList eventId={event.id} sources={data.sources} source={callSource} onSourceChange={setCallSource} version={data.stats.arrived} />
          </div>
        </div>
      )}
    </div>
  );
}

function LiveView({ data, now, showCallList }: { data: DashboardData; now: number; showCallList: () => void }) {
  return (
    <div role="tabpanel" aria-label="Live operations" className="space-y-5">
      <Attention data={data} now={now} showCallList={showCallList} />
      <KpiRow data={data} now={now} showCallList={showCallList} />
      <div className="grid gap-5 lg:grid-cols-12">
        <ArrivalsChart data={data} now={now} className="lg:col-span-7" />
        {/* The feed takes the chart's height and scrolls inside it, so the row never grows past the chart. */}
        <div className="lg:relative lg:col-span-5 lg:min-h-[26rem]">
          <LiveFeed data={data} now={now} className="lg:absolute lg:inset-0" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-12">
        <RoomCapacity data={data} className="lg:col-span-7" />
        <WaitingList data={data} now={now} className="lg:col-span-5" />
      </div>
      <TeamGrid data={data} />
    </div>
  );
}

function StatusPill({ status }: { status: DashboardData['event']['status'] }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />Live
      </span>
    );
  }
  return (
    <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
      {status === 'draft' ? 'Draft · check-in not open' : 'Completed'}
    </span>
  );
}

/** How fresh the numbers are. Ticks every second on its own, so the rest of the page doesn't re-render. */
function Freshness({ live, error, loadedAt }: { live: boolean; error: string | null; loadedAt: number | null }) {
  const now = useNow(1000);
  if (!loadedAt) return null;
  if (error) {
    return (
      <span className="text-sm text-amber-800" role="status">
        Couldn’t refresh. Showing data from {clock(loadedAt)}.
      </span>
    );
  }
  const seconds = Math.max(0, Math.floor((now - loadedAt) / 1000));
  return (
    <span className="text-sm text-niat-muted">
      {live ? `Updates every 5 s · ${seconds < 5 ? 'just now' : `${seconds} s ago`}` : `Updated ${clock(loadedAt)}`}
    </span>
  );
}
