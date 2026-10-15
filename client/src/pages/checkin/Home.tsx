import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../../lib/api';
import { CtaButton, LoadingDots } from '../../components/kiosk/CtaButton';
import { CalmCard, KioskShell } from '../../components/kiosk/Shell';

interface LiveEvent {
  name: string;
  date: string;
  time: string;
  locationName: string;
  city: string;
  state: string;
  publicPath: string;
}

/** Landing page: today's live events. Most students arrive straight on their event's page via the QR code. */
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
      <KioskShell>
        <CalmCard icon="📶" title="Connection problem" message={error}
          action={<CtaButton variant="ghost" size="md" arrow={false} onClick={load}>Try again</CtaButton>} />
      </KioskShell>
    );
  }

  if (!events) {
    return <KioskShell><div className="grid flex-1 place-items-center text-niat-muted"><LoadingDots label="Getting things ready" /></div></KioskShell>;
  }

  return (
    <KioskShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center pt-4 text-center sm:pt-12">
        <div className="eyebrow animate-fade-up">NIAT presents</div>
        <h1 className="mt-3 animate-fade-up font-extrabold leading-[0.95] tracking-tight">
          <span className="block text-2xl font-bold text-niat-muted sm:text-3xl">Welcome to</span>
          <span className="mt-1 block bg-gradient-to-br from-niat-maroon via-niat-maroon to-niat-maroon-dark bg-clip-text text-[44px] text-transparent sm:text-7xl">
            AI BOOTCAMP
          </span>
        </h1>

        {events.length === 0 ? (
          <p className="mt-6 max-w-md animate-fade-up text-lg text-niat-muted">
            No check-in is open right now. At the venue, scan the QR code at the entrance to check in.
          </p>
        ) : (
          <>
            <p className="mt-5 animate-fade-up text-lg text-niat-muted">
              Scan the QR code at your venue, or choose your event below.
            </p>
            <ul className="mt-7 w-full space-y-3 text-left">
              {events.map((e, i) => (
                <li key={e.publicPath} className="stagger animate-fade-up" style={{ '--i': i } as React.CSSProperties}>
                  <Link to={e.publicPath}
                    className="group flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-niat-line bg-white/90 px-5 py-4 shadow-[var(--shadow-card)] backdrop-blur transition-all hover:-translate-y-0.5 hover:border-niat-maroon/30 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 sm:px-6 sm:py-5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-niat-maroon">📍 {e.locationName}</div>
                      <div className="mt-0.5 truncate text-lg font-extrabold sm:text-xl">{e.name}</div>
                      <div className="text-sm text-niat-muted">{formatDate(e.date)}{e.time ? ` · ${e.time}` : ''}</div>
                    </div>
                    <span aria-hidden className="shrink-0 text-2xl font-bold text-niat-maroon transition-transform group-hover:translate-x-1">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link to="/admin" className="mt-10 text-xs font-semibold text-niat-muted/80 hover:text-niat-maroon">Organizer sign-in</Link>
      </div>
    </KioskShell>
  );
}
