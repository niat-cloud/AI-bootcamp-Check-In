import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { CheckinButton, CheckinShell, Seeker, Shield, StateCard } from '../../components/checkin/CheckinUI';
import { QrScanner } from '../../components/checkin/QrScanner';

interface LiveEvent {
  name: string;
  date: string;
  time: string;
  locationName: string;
  city: string;
  state: string;
  publicPath: string;
}

/**
 * Fallback landing page (/). Students normally never see it: the QR code at each venue opens that
 * venue's event page directly. People land here when they typed the bare address, opened a shared
 * link, or closed the tab after checking in. So, in order:
 *   1. someone who already checked in on this phone goes straight back to their seat or project;
 *   2. everyone else is told to scan the QR at their venue (the right way in);
 *   3. or picks their venue from today's open events, grouped by city.
 */
export default function Home() {
  const [events, setEvents] = useState<LiveEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<LiveEvent[]>('/public/live').then(setEvents).catch((err) => setError((err as Error).message));
  }, []);
  useEffect(load, [load]);

  if (error) {
    return (
      <CheckinShell footer="help">
        <StateCard title="Can’t connect right now"
          actions={<CheckinButton type="button" arrow={false} onClick={load}>Try again</CheckinButton>}>
          Check your internet connection and try again. At the venue, you can also scan the QR code at the entrance.
        </StateCard>
      </CheckinShell>
    );
  }
  if (!events) return <CheckinShell footer="none"><Seeker message="Loading today’s events" /></CheckinShell>;

  return <Landing events={events} />;
}

const dayLabel = (iso: string) => {
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return iso === local ? 'Today' : new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const enter = (i: number) => ({ className: 'checkin-enter', style: { '--i': i } as React.CSSProperties });

/** Events this phone already checked in to (the event page remembers the number once a seat is given). */
function checkedInHere(events: LiveEvent[]) {
  return events.filter((e) => {
    try { return Boolean(localStorage.getItem(`aibootcamp.phone.${e.publicPath}`)); } catch { return false; }
  });
}

function Landing({ events }: { events: LiveEvent[] }) {
  const mine = useMemo(() => checkedInHere(events), [events]);
  const others = events.filter((e) => !mine.includes(e));
  const [scanning, setScanning] = useState(false);
  const navigate = useNavigate();
  const closeScanner = useCallback(() => setScanning(false), []);
  const openScanned = useCallback((path: string) => navigate(path), [navigate]);
  const scan = () => setScanning(true);
  let i = 0;

  return (
    <CheckinShell footer="help">
      {scanning && <QrScanner onResult={openScanned} onClose={closeScanner} />}
      <div className="flex flex-1 flex-col justify-center pb-4">
        <header className="text-center">
          <div {...enter(i++)}><Shield size={52} className="mx-auto" /></div>
          <h1 {...enter(i++)} className="checkin-enter mt-3">
            <span className="checkin-wordmark block whitespace-nowrap" style={{ fontSize: 'clamp(2.25rem, 11.5vw, 3.1rem)' }}>AI BOOTCAMP</span>
          </h1>
          <p {...enter(i++)} className="checkin-enter mt-2 text-[15px] font-semibold text-[var(--checkin-muted)]">
            {mine.length ? 'Good to see you again.' : 'Check in and get your seat in seconds.'}
          </p>
        </header>

        {mine.map((e) => <WelcomeBack key={e.publicPath} event={e} i={i++} />)}

        {mine.length ? (
          <div {...enter(i++)} className="checkin-enter mt-5 text-center">
            <button type="button" onClick={scan} className="checkin-link inline-flex items-center gap-2 py-2 text-[15px]">
              <ScanIcon className="h-5 w-5" /> At another venue? Scan its QR code
            </button>
          </div>
        ) : (
          <ScanHero i={i++} onScan={scan} />
        )}

        {others.length > 0 && (
          <section {...enter(i++)} className="checkin-enter mt-8" aria-labelledby="venues">
            <h2 id="venues" className="flex items-center gap-3 text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--checkin-muted)]">
              <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--checkin-line)]" />
              {mine.length ? 'Other venues today' : 'Or choose your venue'}
              <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--checkin-line)]" />
            </h2>
            <VenueList events={others} />
          </section>
        )}
        {events.length === 0 && (
          <p {...enter(i++)} className="checkin-enter mx-auto mt-6 max-w-[30ch] text-center text-sm leading-relaxed text-[var(--checkin-muted)]">
            No check-in is open right now. It opens at each venue on the event day.
          </p>
        )}
      </div>
    </CheckinShell>
  );
}

/** Returning student: one tap back to their seat, and to their team's project. */
function WelcomeBack({ event, i }: { event: LiveEvent; i: number }) {
  return (
    <div {...enter(i)} className="checkin-enter checkin-glass mt-7 px-5 py-5 text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--checkin-blush)] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--checkin-maroon)]">
        <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        Checked in
      </span>
      <p className="mt-2.5 text-[17px] font-extrabold leading-snug">{event.locationName}</p>
      <p className="text-sm text-[var(--checkin-muted)]">Your seat is saved on this phone.</p>
      <div className="mt-4 grid gap-1">
        <Link to={event.publicPath} className="checkin-cta">
          <span>See My Seat</span>
          <svg aria-hidden viewBox="0 0 24 24" className="checkin-arrow h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
        <Link to={`${event.publicPath}/project`} className="checkin-link py-2.5 text-[15px]">Submit our team’s project</Link>
      </div>
    </div>
  );
}

function ScanIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16" />
    </svg>
  );
}

/** The right way in: a big viewfinder that opens the camera, so "scan" reads without any text. */
function ScanHero({ i, onScan }: { i: number; onScan: () => void }) {
  return (
    <div {...enter(i)} className="checkin-enter checkin-glass mt-7 px-5 pb-5 pt-6 text-center">
      <button type="button" onClick={onScan} aria-label="Open the camera to scan the venue QR code"
        className="qr-finder group relative mx-auto block h-40 w-40 rounded-[26px] bg-white/70 transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgb(165_9_37/0.25)]">
        {['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[26px]', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[26px]',
          'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[26px]', 'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[26px]'].map((c) => (
          <span key={c} aria-hidden className={`absolute h-10 w-10 border-[var(--checkin-maroon)] ${c}`} />
        ))}
        {/* A stylised QR code, softly tinted, behind the sweeping line. */}
        <svg aria-hidden viewBox="0 0 29 29" className="absolute inset-8 text-[var(--checkin-ink)] opacity-[0.16]" fill="currentColor" shapeRendering="crispEdges">
          {[[0, 0], [22, 0], [0, 22]].map(([x, y]) => (
            <g key={`${x}-${y}`}><path d={`M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5z`} fillRule="evenodd" /><rect x={x + 2} y={y + 2} width="3" height="3" /></g>
          ))}
          {[[9, 1], [11, 3], [13, 0], [15, 4], [10, 9], [14, 10], [18, 9], [1, 10], [4, 13], [7, 15], [12, 13], [16, 15], [20, 13], [24, 11], [26, 15],
            [9, 18], [13, 20], [17, 19], [22, 22], [25, 24], [20, 26], [11, 25], [15, 27], [27, 27], [9, 23], [24, 18]].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="2" height="2" />
          ))}
        </svg>
        <span aria-hidden className="qr-scan-line absolute inset-x-6 h-[3px] rounded-full bg-[var(--checkin-maroon)] shadow-[0_0_14px_2px_rgb(165_9_37/0.45)]" />
      </button>
      <h2 className="mt-5 text-[19px] font-extrabold tracking-tight">Scan the QR code at the entrance</h2>
      <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-relaxed text-[var(--checkin-muted)]">It opens check-in for your venue. Your phone’s camera app works too.</p>
      <div className="mt-5">
        <CheckinButton type="button" arrow={false} onClick={onScan}>
          <span className="inline-flex items-center gap-2.5"><ScanIcon className="h-5 w-5" /> Scan QR Code</span>
        </CheckinButton>
      </div>
    </div>
  );
}

/** Today's open events, grouped by city so a student finds theirs at a glance. */
function VenueList({ events }: { events: LiveEvent[] }) {
  const byCity = useMemo(() => {
    const map = new Map<string, LiveEvent[]>();
    for (const e of events) map.set(e.locationName, [...(map.get(e.locationName) ?? []), e]);
    return [...map.entries()];
  }, [events]);

  return (
    <ul className="mt-3 space-y-2.5">
      {byCity.map(([city, list]) => list.map((e) => (
        <li key={e.publicPath}>
          <Link to={e.publicPath}
            className="checkin-glass group flex items-center gap-4 px-4 py-3.5 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgb(165_9_37/0.2)]">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--checkin-maroon)] ring-1 ring-[var(--checkin-line)]">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-extrabold leading-tight">{city}</div>
              {/* Only name the event when a city has more than one, so the list stays short. */}
              <div className="mt-0.5 truncate text-sm text-[var(--checkin-muted)]">
                {list.length > 1 ? `${e.name} · ` : ''}{dayLabel(e.date)}{e.time ? ` · ${e.time}` : ''}
              </div>
            </div>
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--checkin-maroon)] transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </li>
      )))}
    </ul>
  );
}
