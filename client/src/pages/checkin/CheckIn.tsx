import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, checkAdminAuth, type EventInfo, type SearchResult, type SeatAssignment } from '../../lib/api';
import { CtaButton, LoadingDots } from '../../components/kiosk/CtaButton';
import { EmptyState, Notice } from '../../components/kiosk/Form';
import { SearchBox, SearchResultCard } from '../../components/kiosk/Search';
import { SeatReveal } from '../../components/kiosk/SeatReveal';
import { CalmCard, KioskShell } from '../../components/kiosk/Shell';
import { StudentCard } from '../../components/kiosk/StudentCard';
import { ProgressPopup } from '../../components/kiosk/ProgressPopup';
import { atLeast, useIsMobile } from '../../lib/device';
import WalkInForm from './WalkInForm';

type Screen =
  | { kind: 'search' }
  | { kind: 'confirm'; student: SearchResult }
  | { kind: 'loading' }
  | { kind: 'result'; assignment: SeatAssignment }
  | { kind: 'walkin' }
  | { kind: 'blocked'; title: string; message: string };

// The full staggered intro plays once per page load; later returns to search are instant.
let introPlayed = false;

/**
 * Gate kiosk for volunteers: /gate/:eventId. Searches by name or phone, so it needs an admin of the
 * event's location to be signed in on this device. Students use the public event link instead.
 */
export default function CheckIn() {
  const { eventId = '' } = useParams();
  const apiBase = `/events/${encodeURIComponent(eventId)}/gate`;
  const [auth, setAuth] = useState<'checking' | 'ok' | 'signed-out'>('checking');
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'search' });
  const [query, setQuery] = useState('');
  const isMobile = useIsMobile();
  const mode = isMobile ? 'personal' : 'kiosk';

  useEffect(() => {
    checkAdminAuth().then((u) => setAuth(u && !u.mustChangePassword ? 'ok' : 'signed-out'));
    const onUnauthorized = () => setAuth('signed-out');
    window.addEventListener('admin_unauthorized', onUnauthorized);
    return () => window.removeEventListener('admin_unauthorized', onUnauthorized);
  }, []);

  const loadEvent = useCallback(() => {
    setLoadError(null);
    api<EventInfo>(`/events/${encodeURIComponent(eventId)}`).then(setEvent).catch((err) => setLoadError((err as Error).message));
  }, [eventId]);
  useEffect(() => { if (auth === 'ok') loadEvent(); }, [auth, loadEvent]);

  const reset = useCallback(() => {
    setQuery('');
    setScreen({ kind: 'search' });
  }, []);

  const showSeat = (assignment: SeatAssignment) => setScreen({ kind: 'result', assignment });

  /** Turns known API errors into a full-screen state; rethrows anything else for inline display. */
  const handleError = (err: unknown) => {
    const e = err as ApiError;
    if (e.code === 'VENUE_FULL') {
      // The server has already recorded the arrival on the waiting list.
      setScreen({ kind: 'blocked', title: "You're on the waiting list", message: "You're checked in, but every seat is taken right now. Please wait near the desk — an organizer will give you a seat shortly." });
    } else if (e.code === 'EVENT_NOT_ACTIVE') {
      loadEvent();
      setScreen({ kind: 'blocked', title: 'Check-in is closed', message: e.message });
    } else {
      throw err;
    }
  };

  const select = (student: SearchResult) => {
    if (!student.seatCode) {
      setScreen({ kind: 'confirm', student });
      return;
    }
    // Returning student: go straight to their existing seat — never assign again.
    setScreen({ kind: 'loading' });
    api<SeatAssignment>(`${apiBase}/participant/${student.eventParticipantId}`)
      .then(showSeat)
      .catch((err) => {
        try { handleError(err); } catch { setScreen({ kind: 'confirm', student }); }
      });
  };

  if (auth === 'signed-out') {
    return (
      <KioskShell>
        <CalmCard icon="🔐" title="Gate kiosk needs an admin"
          message="Sign in to the admin panel on this device, then open the gate kiosk again from Event Setup. Students can use the event's public link or QR code instead."
          action={<Link to="/admin" className="btn-primary">Sign in</Link>} />
      </KioskShell>
    );
  }

  if (loadError) {
    return (
      <KioskShell>
        <CalmCard icon="📶" title="Couldn't open this event" message={loadError}
          action={<CtaButton variant="ghost" size="md" arrow={false} onClick={loadEvent}>Try again</CtaButton>} />
      </KioskShell>
    );
  }

  if (!event) {
    return <KioskShell><div className="grid flex-1 place-items-center text-niat-muted"><LoadingDots label="Getting things ready" /></div></KioskShell>;
  }

  if (event.status !== 'active') {
    return (
      <KioskShell date={event.date} place={event.locationName ?? undefined}>
        <CalmCard
          icon="🌙"
          title={event.status === 'completed' ? 'Check-in has closed' : 'Check-in opens soon'}
          message={event.status === 'completed'
            ? "This AI Bootcamp event is completed. Thank you for being part of it!"
            : 'Activate the event in Event Setup to open check-in.'}
          action={<CtaButton variant="ghost" size="md" arrow={false} onClick={loadEvent}>Refresh</CtaButton>}
        />
      </KioskShell>
    );
  }

  return (
    <KioskShell date={event.date} place={event.locationName ?? undefined} onHome={reset}>
      {screen.kind === 'search' && (
        <SearchScreen
          apiBase={apiBase}
          query={query}
          setQuery={setQuery}
          onSelect={select}
          onWalkIn={() => setScreen({ kind: 'walkin' })}
          onError={handleError}
          mobile={isMobile}
        />
      )}
      {screen.kind === 'confirm' && (
        <ConfirmScreen
          apiBase={apiBase}
          student={screen.student}
          onBack={() => setScreen({ kind: 'search' })}
          onAssigned={showSeat}
          onError={handleError}
          mobile={isMobile}
        />
      )}
      {screen.kind === 'loading' && (
        <div className="grid flex-1 place-items-center text-lg text-niat-muted"><LoadingDots label="Finding your seat" /></div>
      )}
      {screen.kind === 'result' && <SeatReveal assignment={screen.assignment} mode={mode} onDone={reset} />}
      {screen.kind === 'walkin' && (
        <WalkInForm
          endpoint={`${apiBase}/walk-in`}
          initialName={/\d/.test(query) ? '' : query.trim()}
          initialPhone={/^[\d\s+-]+$/.test(query.trim()) ? query.trim() : ''}
          onCancel={() => setScreen({ kind: 'search' })}
          onAssigned={showSeat}
          onError={handleError}
        />
      )}
      {screen.kind === 'blocked' && (
        <CalmCard icon="🙏" title={screen.title} message={screen.message}
          action={<CtaButton size="md" onClick={reset} autoFocus>Back to search</CtaButton>} />
      )}
    </KioskShell>
  );
}

function SearchScreen({ apiBase, query, setQuery, onSelect, onWalkIn, onError, mobile }: {
  apiBase: string;
  query: string;
  setQuery: (q: string) => void;
  onSelect: (s: SearchResult) => void;
  onWalkIn: () => void;
  onError: (err: unknown) => void;
  mobile: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchedFor, setSearchedFor] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [intro] = useState(() => !introPlayed);

  useEffect(() => {
    introPlayed = true;
    // Phones: let students see the welcome first instead of popping the keyboard.
    if (!mobile) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchedFor('');
      setBusy(false);
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<SearchResult[]>(`${apiBase}/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => {
          setResults(r);
          setSearchedFor(q);
          setHighlight(0);
          setFailed(null);
          setBusy(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          setBusy(false);
          try { onError(err); } catch { setFailed(err.message); }
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const noMatch = Boolean(searchedFor) && searchedFor === query.trim() && results.length === 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter') {
      if (results[highlight]) onSelect(results[highlight]);
      else if (noMatch) onWalkIn();
    }
    if (e.key === 'Escape') setQuery('');
  };

  // Intro: staggered reveal on first load. Afterwards: one quick fade so the operator never waits.
  const enter = (i: number) => intro
    ? { className: 'stagger animate-fade-up', style: { '--i': i } as React.CSSProperties }
    : { className: 'animate-fade-in', style: undefined };

  const hasQuery = query.trim().length >= 2;
  // Compact hero while typing (and while the phone keyboard is open) so results stay visible.
  const compact = hasQuery || (mobile && focused);

  return (
    <div className={`mx-auto flex w-full max-w-3xl flex-col items-center text-center ${compact ? 'pt-1 sm:pt-4' : 'pt-4 sm:pt-14'}`}>
      <div {...enter(0)} className={`eyebrow ${enter(0).className}`}>NIAT presents</div>
      <h1 {...enter(1)} className={`mt-3 font-extrabold leading-[0.95] tracking-tight ${enter(1).className}`}>
        <span className="block text-2xl font-bold text-niat-muted sm:text-3xl">Welcome to</span>
        <span className={`mt-1 block bg-gradient-to-br from-niat-maroon via-niat-maroon to-niat-maroon-dark bg-clip-text text-transparent transition-all duration-300 ${
          compact ? 'text-3xl sm:text-5xl' : 'text-[44px] sm:text-7xl'}`}>
          AI BOOTCAMP
        </span>
      </h1>

      {!compact && (
        <div {...enter(2)} className={enter(2).className}>
          <p className="mt-5 text-xl font-bold text-niat-text sm:text-2xl">Your seat is waiting.</p>
          <p className="mx-auto mt-2 max-w-md text-base text-niat-muted sm:text-lg">
            Find your registration and discover where your AI Bootcamp journey begins.
          </p>
        </div>
      )}

      <div className={`w-full ${compact ? 'mt-4 sm:mt-6' : 'mt-7 sm:mt-9'} ${intro ? 'animate-scale-in' : ''}`}
        style={intro ? { animationDelay: '280ms' } : undefined}>
        <SearchBox ref={inputRef} value={query} onChange={setQuery} onKeyDown={onKeyDown} busy={busy}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onClear={() => { setQuery(''); inputRef.current?.focus(); }} />
        {!compact && (
          <p className="mt-3 text-sm text-niat-muted">
            <span aria-hidden>⚡</span> Phone number is the fastest way to find you.
          </p>
        )}
      </div>

      {failed && <div className="mt-4 w-full"><Notice>{failed}</Notice></div>}

      {results.length > 0 && (
        <div className="mt-5 w-full text-left">
          <p className="mb-2 px-1 text-sm font-semibold text-niat-muted">
            {results.length === 1 ? 'Is this you?' : `${results.length} matches — pick yours`}
          </p>
          <ul className="space-y-2.5">
            {results.map((r, i) => (
              <li key={r.eventParticipantId}>
                <SearchResultCard result={r} index={i} active={i === highlight}
                  onSelect={() => onSelect(r)} onHover={() => setHighlight(i)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {noMatch && <div className="mt-6 w-full"><EmptyState query={searchedFor} onRegister={onWalkIn} /></div>}

      {!noMatch && (
        <div {...enter(3)} className={`mt-10 ${enter(3).className}`} style={{ ...enter(3).style, animationDelay: intro ? '420ms' : undefined }}>
          <p className="text-niat-muted">New to the list?</p>
          <button onClick={onWalkIn}
            className="group mt-1 cursor-pointer rounded-lg px-2 py-1 text-lg font-bold text-niat-maroon underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50">
            Register as a new student <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmScreen({ apiBase, student, onBack, onAssigned, onError, mobile }: {
  apiBase: string;
  student: SearchResult;
  onBack: () => void;
  onAssigned: (a: SeatAssignment) => void;
  onError: (err: unknown) => void;
  mobile: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!mobile) ctaRef.current?.focus({ preventScroll: true }); }, [mobile]);

  const getSeat = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onAssigned(await atLeast(api<SeatAssignment>(`${apiBase}/assign`, { body: { eventParticipantId: student.eventParticipantId } }), 900));
    } catch (err) {
      setBusy(false);
      try { onError(err); } catch { setError((err as Error).message); }
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl pb-40 pt-1 text-center sm:pb-0 sm:pt-6">
      {busy && <ProgressPopup title="Getting your seat" steps={['Checking your registration', 'Finding your team', 'Reserving your seat']} />}
      <div className="eyebrow animate-fade-up text-[11px] sm:text-xs">Let's get you ready</div>
      <h1 className="mt-2 animate-fade-up text-3xl font-extrabold tracking-tight sm:text-5xl">We found you! 👋</h1>
      <div className="mt-5 sm:mt-7 animate-scale-in text-left" style={{ animationDelay: '80ms' }}>
        <StudentCard {...student} />
      </div>
      {error && <div className="mt-5"><Notice>{error}</Notice></div>}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-niat-line bg-white/85 px-5 pt-3 backdrop-blur-md sm:static sm:mt-7 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <CtaButton ref={ctaRef} onClick={getSeat} loading={busy} loadingLabel="Finding your seat" className="w-full">
          Get My Seat
        </CtaButton>
        <button onClick={onBack} disabled={busy}
          className="mt-1 w-full cursor-pointer rounded-lg px-3 py-2 font-semibold text-niat-muted sm:mt-4 sm:w-auto transition-colors hover:text-niat-maroon focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50 disabled:opacity-40">
          Not you? Search again
        </button>
      </div>
    </div>
  );
}
