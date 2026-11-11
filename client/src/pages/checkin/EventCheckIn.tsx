import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type SeatAssignment } from '../../lib/api';
import {
  classLabel, GRADE_OPTIONS, hasStream, LUNCH_LABEL, LUNCH_OPTIONS, STREAM_OPTIONS, type Answers, type Grade, type Lunch, type Stream,
} from '../../lib/answers';
import { atLeast } from '../../lib/device';
import { digitsHint, typedPhone } from '../../lib/phone';
import { ProgressPopup } from '../../components/kiosk/ProgressPopup';
import { SeatReveal } from '../../components/kiosk/SeatReveal';
import logo from '../../assets/niat-logo.png';
import { KioskShell } from '../../components/kiosk/Shell';
import {
  CheckinButton, CheckinChoice, CheckinField, CheckinNotice, CheckinSelect, CheckinShell, EventMeta, Seeker, StateCard,
} from '../../components/checkin/CheckinUI';

interface PublicEvent {
  name: string;
  date: string;
  time: string;
  status: 'draft' | 'active' | 'completed';
  locationName: string;
  city: string;
  state: string;
}

interface KnownStudent {
  name: string;
  schoolCollege: string;
  className: string | null;
  location: string | null;
  hasParentPhone: boolean;
  /** Saved parent number, masked (••••••4788), or null. */
  parentPhone?: string | null;
  parentName?: string | null;
  phone: string; // masked
  /** Answers already given for this event (an interrupted check-in), pre-selected. */
  answers?: Answers | null;
}

type Lookup =
  | { state: 'seated'; assignment: SeatAssignment }
  | { state: 'waiting' | 'registered' | 'returning'; participant: KnownStudent }
  | { state: 'new'; phone: string };

interface Details {
  name: string;
  parentName: string;
  parentPhone: string;
  schoolCollege: string;
  location: string;
  /** Class, group and lunch: tapped on the same form. */
  grade: Grade | '';
  stream: Stream | '';
  studyDetail: string;
  lunch: Lunch | '';
}

type Kind = 'registered' | 'returning' | 'new';

type Screen =
  | { kind: 'entry'; error?: { message: string; retry: boolean } }
  | { kind: 'finding'; message: string }
  | { kind: 'not-found' }
  | { kind: 'find-by-name' }
  | { kind: 'details'; lookup: Kind; known: KnownStudent | null; details: Details }
  | { kind: 'confirm'; lookup: Kind; known: KnownStudent | null; details: Details; error?: string }
  /** welcomeBack: this phone already showed the seat before (link reopened), so greet instead of celebrating. */
  | { kind: 'seat'; assignment: SeatAssignment; welcomeBack: boolean }
  | { kind: 'waiting'; name: string };

/** 98765 43210, +91 98765 43210, 098765 43210 → 9876543210 (or null). */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const prettyPhone = (d: string) => `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
/** "Thu, 15 Oct 2026" (no comma before the year). */
const eventDate = (iso: string) => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

// This phone remembers who checked in on it, so reopening the link shows their seat again.
const phoneKey = (path: string) => `aibootcamp.phone.${path}`;
const recallPhone = (path: string) => { try { return localStorage.getItem(phoneKey(path)); } catch { return null; } };
const rememberPhone = (path: string, phone: string) => { try { localStorage.setItem(phoneKey(path), phone); } catch { /* storage unavailable */ } };
/** Who is checking in: phone digits, or "ref:<pass>" when the student found themselves by name. */
const isClaim = (key: string) => key.startsWith('ref:');
const whoBody = (key: string) => (isClaim(key) ? { ref: key.slice(4) } : { phone: key });
const forgetPhone = (path: string) => { try { localStorage.removeItem(phoneKey(path)); } catch { /* storage unavailable */ } };

const emptyDetails: Details = {
  name: '', parentName: '', parentPhone: '', schoolCollege: '', location: '', grade: '', stream: '', studyDetail: '', lunch: '',
};

/** The class, group and lunch picked on the form, as the server takes them (null until all are picked). */
function answersOf(d: Details): Answers | null {
  if (!d.grade || !d.lunch || (hasStream(d.grade) && !d.stream)) return null;
  return { grade: d.grade, stream: hasStream(d.grade) ? d.stream || null : null, studyDetail: d.studyDetail.trim() || null, lunch: d.lunch };
}
const needsDetail = (d: Details) => d.grade === 'other' || (hasStream(d.grade || null) && d.stream === 'other');
const isNetwork = (err: unknown) => (err as ApiError).code === 'NETWORK';

/**
 * The page students open from the QR code at the venue, e.g. /hyderabad/18-oct-2026:
 * mobile number → (confirm or fill in details) → confirm → their seat, team and room.
 */
export default function EventCheckIn() {
  const { location = '', slug = '' } = useParams();
  const base = `/public/events/${encodeURIComponent(location)}/${encodeURIComponent(slug)}`;
  const path = `${location}/${slug}`.toLowerCase();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'entry' });
  const [phone, setPhone] = useState('');
  /** Set when the student found themselves by name: "ref:<pass>" stands in for the number they don't know. */
  const [claim, setClaim] = useState<string | null>(null);

  const loadEvent = useCallback(() => {
    setLoadError(null);
    api<PublicEvent>(base).then(setEvent).catch((err) => setLoadError(err as ApiError));
  }, [base]);
  useEffect(loadEvent, [loadEvent]);

  const lookup = (key: string) => api<Lookup>(`${base}/lookup`, { body: whoBody(key) });

  /** Turns a lookup result into the next screen. */
  const route = useCallback((digits: string, result: Lookup, reopened = false) => {
    if (result.state === 'seated') {
      rememberPhone(path, digits);
      setScreen({ kind: 'seat', assignment: result.assignment, welcomeBack: reopened });
    } else if (result.state === 'waiting') {
      rememberPhone(path, digits);
      setScreen({ kind: 'waiting', name: result.participant.name });
    } else if (result.state === 'new') {
      setScreen({ kind: 'not-found' });
    } else {
      const k = result.participant;
      const details: Details = {
        name: k.name, parentName: k.parentName ?? '', parentPhone: '', schoolCollege: k.schoolCollege, location: k.location ?? '',
        grade: k.answers?.grade ?? '', stream: k.answers?.stream ?? '', studyDetail: k.answers?.studyDetail ?? '', lunch: k.answers?.lunch ?? '',
      };
      // A registered student whose details are complete only needs to confirm them.
      const complete = Boolean(details.name && details.schoolCollege && details.location && details.parentName && k.hasParentPhone);
      setScreen({ kind: complete && answersOf(details) && result.state === 'registered' ? 'confirm' : 'details', lookup: result.state, known: k, details });
    }
  }, [path]);

  // Reopening the link on the same phone goes straight back to the seat (or the waiting list).
  useEffect(() => {
    if (event?.status !== 'active') return;
    const saved = recallPhone(path);
    if (!saved) return;
    if (isClaim(saved)) setClaim(saved); else setPhone(saved);
    setScreen({ kind: 'finding', message: 'Finding your seat…' });
    lookup(saved)
      .then((r) => {
        if (r.state === 'seated' || r.state === 'waiting') route(saved, r, true);
        else { forgetPhone(path); setScreen({ kind: 'entry' }); }
      })
      .catch(() => setScreen({ kind: 'entry' }));
  }, [event?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    forgetPhone(path);
    setPhone('');
    setClaim(null);
    setScreen({ kind: 'entry' });
  };

  const findRegistration = async (digits: string) => {
    setScreen({ kind: 'finding', message: 'Finding your registration…' });
    try {
      route(digits, await atLeast(lookup(digits), 700));
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'EVENT_NOT_ACTIVE') return loadEvent();
      if (isClaim(digits)) setClaim(null);
      setScreen({ kind: 'entry', error: { message: e.message, retry: isNetwork(err) } });
    }
  };

  /** Confirm → seat. The confirm screen shows the "Getting your seat" pop-up while this runs. */
  const getSeat = async (s: Extract<Screen, { kind: 'confirm' }>) => {
    const digits = claim ?? normalizePhone(phone)!;
    try {
      const assignment = await atLeast(api<SeatAssignment>(`${base}/checkin`, {
        body: {
          name: s.details.name, parentName: s.details.parentName, schoolCollege: s.details.schoolCollege, location: s.details.location,
          ...whoBody(digits), parentPhone: s.details.parentPhone || undefined, answers: answersOf(s.details),
        },
      }), 900);
      rememberPhone(path, digits);
      setScreen({ kind: 'seat', assignment, welcomeBack: false });
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'VENUE_FULL') {
        rememberPhone(path, digits);
        setScreen({ kind: 'waiting', name: s.details.name });
      } else if (e.code === 'EVENT_NOT_ACTIVE') {
        loadEvent();
      } else {
        setScreen({ ...s, error: e.message });
      }
    }
  };

  // ---- Event-level states ----

  if (loadError) {
    const notFound = loadError.status === 404;
    return (
      <CheckinShell footer="entry">
        <StateCard
          title={notFound ? 'This event link doesn’t exist' : 'Can’t reach the event'}
          actions={!notFound && <CheckinButton onClick={loadEvent} arrow={false}>Try again</CheckinButton>}>
          {notFound
            ? 'Check the address, or scan the QR code at the venue entrance again.'
            : 'Check your internet connection, then try again.'}
        </StateCard>
      </CheckinShell>
    );
  }

  if (!event) {
    return <CheckinShell footer="none"><Seeker message="Getting things ready…" /></CheckinShell>;
  }

  if (event.status !== 'active') {
    return (
      <CheckinShell footer="entry">
        {event.status === 'draft' ? (
          <StateCard title="Check-in opens soon"
            actions={<CheckinButton onClick={loadEvent} arrow={false}>Check again</CheckinButton>}>
            Check-in for AI Bootcamp in {event.locationName} opens on {eventDate(event.date)}{event.time ? ` at ${event.time}` : ''}. Open this page again when you arrive.
          </StateCard>
        ) : (
          <StateCard title="This event has ended">
            Check-in for AI Bootcamp in {event.locationName} is closed. Thank you for being part of it.
          </StateCard>
        )}
      </CheckinShell>
    );
  }

  // ---- Check-in flow ----

  switch (screen.kind) {
    case 'finding':
      return <CheckinShell footer="none"><Seeker message={screen.message} /></CheckinShell>;

    case 'seat':
      // The seat reveal from the original check-in: confetti, team, seat, room and teammates.
      // The first time a phone shows the seat it celebrates, even if a volunteer assigned it earlier;
      // "Welcome back" is only for reopening the link on the same phone.
      return (
        <KioskShell minimal>
          <SeatReveal assignment={{ ...screen.assignment, alreadyAssigned: screen.welcomeBack }} mode="personal" onDone={restart}
            event={{ locationName: event.locationName, date: event.date, time: event.time }} />
        </KioskShell>
      );

    case 'waiting':
      return (
        <CheckinShell footer="help">
          <StateCard title="You’re on the waiting list"
            actions={
              <>
                <CheckinButton arrow={false} onClick={() => findRegistration(recallPhone(path) ?? normalizePhone(phone) ?? '')}>Check again</CheckinButton>
                <button type="button" onClick={restart} className="checkin-link px-2 py-2 text-sm">Use a different number</button>
              </>
            }>
            {screen.name ? `${screen.name.split(/\s+/)[0]}, you’re` : 'You’re'} checked in, but every seat is taken right now.
            Stay near the help desk. Organizers are adding seats, and your seat appears here as soon as one is free.
          </StateCard>
        </CheckinShell>
      );

    case 'not-found':
      return (
        <CheckinShell footer="entry">
          <NotFoundStep phone={normalizePhone(phone) ?? ''}
            onRetry={() => setScreen({ kind: 'entry' })}
            onForgot={() => setScreen({ kind: 'find-by-name' })}
            onRegister={() => setScreen({ kind: 'details', lookup: 'new', known: null, details: emptyDetails })} />
        </CheckinShell>
      );

    case 'find-by-name':
      return (
        <CheckinShell footer="help">
          <FindByNameStep base={base}
            onBack={() => setScreen({ kind: 'not-found' })}
            onPick={(ref) => { setClaim(`ref:${ref}`); findRegistration(`ref:${ref}`); }}
            onRegister={() => setScreen({ kind: 'details', lookup: 'new', known: null, details: emptyDetails })} />
        </CheckinShell>
      );

    case 'details':
      return (
        <CheckinShell footer="entry">
          <DetailsStep screen={screen} phone={claim ? screen.known?.phone ?? '' : normalizePhone(phone) ?? ''} onBack={() => setScreen({ kind: 'entry' })}
            onNext={(details) => setScreen({ ...screen, kind: 'confirm', details, error: undefined })} />
        </CheckinShell>
      );

    case 'confirm':
      return (
        <CheckinShell footer="entry">
          <ConfirmStep screen={screen} phone={claim ? screen.known?.phone ?? '' : normalizePhone(phone) ?? ''}
            onEdit={() => setScreen({ ...screen, kind: 'details' })} onBack={() => setScreen({ kind: 'entry' })} onConfirm={() => getSeat(screen)} />
        </CheckinShell>
      );

    default:
      return (
        <CheckinShell footer="entry">
          <EntryStep event={event} phone={phone} setPhone={setPhone} error={screen.error} onSubmit={(d) => { setClaim(null); findRegistration(d); }} />
        </CheckinShell>
      );
  }
}

function EntryStep({ event, phone, setPhone, error, onSubmit }: {
  event: PublicEvent;
  phone: string;
  setPhone: (v: string) => void;
  error?: { message: string; retry: boolean };
  onSubmit: (digits: string) => void;
}) {
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = normalizePhone(phone);
  const step = (i: number) => ({ className: 'checkin-enter', style: { '--i': i } as React.CSSProperties });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!digits) {
      setInvalid('Enter a valid 10-digit mobile number, the one you registered with.');
      return;
    }
    setBusy(true);
    onSubmit(digits);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center pb-4 text-center">
      <img {...step(0)} src={logo} alt="NIAT, NxtWave of Innovation in Advanced Technologies"
        className="checkin-enter h-11 w-auto select-none" draggable={false} />
      <h1 {...step(1)} className="checkin-enter mt-6">
        <span className="checkin-wordmark block whitespace-nowrap" style={{ fontSize: 'clamp(2.1rem, 11vw, 2.9rem)' }}>AI BOOTCAMP</span>
      </h1>
      <div {...step(2)} className="checkin-enter mt-3">
        <EventMeta place={event.locationName} date={eventDate(event.date)} />
      </div>

      <form {...step(3)} onSubmit={submit} noValidate className="checkin-enter checkin-glass mt-7 w-full px-5 pb-5 pt-6 text-left">
        <h2 className="text-center text-[22px] font-extrabold tracking-tight">Find your seat</h2>
        <p className="mt-1 text-center text-[15px] text-[var(--checkin-muted)]">Enter the mobile number you registered with.</p>
        <div className="mt-5">
          <CheckinField label="Mobile number" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14}
            placeholder="98765 43210" value={phone} enterKeyHint="go"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPhone(typedPhone(e.target.value)); setInvalid(null); }}
            error={invalid ?? undefined} hint={invalid ? undefined : digitsHint(phone)} />
        </div>
        {error && (
          <CheckinNotice action={error.retry && digits ? (
            <button type="submit" className="checkin-link shrink-0">Retry</button>
          ) : undefined}>
            {error.retry ? 'No connection. Your number is kept, so you can retry.' : error.message}
          </CheckinNotice>
        )}
        <div className="mt-5">
          <CheckinButton type="submit" loading={busy} loadingLabel="Finding your registration">Find My Seat</CheckinButton>
        </div>
      </form>
    </div>
  );
}

/**
 * No registration matches the number. Either it's not the number they registered with,
 * or they're a new participant who came to the event directly.
 */
function NotFoundStep({ phone, onRetry, onForgot, onRegister }: { phone: string; onRetry: () => void; onForgot: () => void; onRegister: () => void }) {
  const step = (i: number) => ({ className: 'checkin-enter', style: { '--i': i } as React.CSSProperties });
  // Written for a nervous first-timer: lead with "no problem", never with an error, and make both paths feel normal.
  return (
    <div className="flex flex-1 flex-col justify-center pb-4 text-center">
      <div {...step(0)}>
        <span aria-hidden className="checkin-wave mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--checkin-blush)] text-[34px]">👋</span>
      </div>
      <h1 {...step(1)} className="checkin-enter mt-4 text-[25px] font-extrabold leading-tight tracking-tight">No worries, let’s get you in</h1>
      <p {...step(2)} className="checkin-enter mx-auto mt-2 max-w-[30ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">
        This number isn’t on our list yet. That happens, and it’s quick to fix.
      </p>

      {/* Most misses are a typo, so the number they typed is shown with a one-tap fix. */}
      <div {...step(3)} className="checkin-enter mx-auto mt-4 flex w-full max-w-[300px] items-center justify-between rounded-2xl bg-white/85 py-2 pl-4 pr-2 text-left ring-1 ring-[var(--checkin-line)]">
        <span>
          <span className="block text-xs font-semibold text-[var(--checkin-muted)]">You entered</span>
          <span className="block text-lg font-extrabold tabular-nums tracking-wide">{prettyPhone(phone)}</span>
        </span>
        <button type="button" onClick={onRetry} className="checkin-link rounded-xl px-3 py-2 text-sm">Edit</button>
      </div>

      <p {...step(4)} className="checkin-enter mt-6 text-[15px] font-bold">Just pick what fits you:</p>
      <div className="mt-3 space-y-3 text-left">
        <Choice i={5} onClick={onRetry} title="I used a different number to register" text="Just use that one instead"
          icon={<path d="M7 3h10a1 1 0 011 1v16a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2" />} />
        <Choice i={6} onClick={onForgot} title="I don’t remember the number" text="Find yourself by name"
          icon={<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>} />
        <Choice i={7} onClick={onRegister} primary title="Not registered, but I’m here!" text="You’re welcome! Register here"
          icon={<><circle cx="10" cy="8" r="4" /><path d="M3 20c0-3.5 3-6 7-6M18 14v6M15 17h6" /></>} />
      </div>
      <p {...step(8)} className="checkin-enter mt-5 text-sm text-[var(--checkin-muted)]">Either way, it only takes a minute.</p>
    </div>
  );
}

interface NameMatch { name: string; schoolCollege: string; checkedIn: boolean; ref: string | null }

/**
 * "I don't remember the number": the student types their name and taps the entry with their college.
 * That goes straight to "Is this you?". Someone already checked in is shown but can't be picked.
 */
function FindByNameStep({ base, onBack, onPick, onRegister }: {
  base: string; onBack: () => void; onPick: (ref: string) => void; onRegister: () => void;
}) {
  const [name, setName] = useState('');
  const [matches, setMatches] = useState<NameMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const letters = name.replace(/\s/g, '').length;

  // Search as they type, after a short pause.
  useEffect(() => {
    const q = name.trim();
    if (q.replace(/\s/g, '').length < 3) { setMatches(null); return; }
    const t = setTimeout(() => {
      api<NameMatch[]>(`${base}/find-by-name`, { body: { name: q } })
        .then((m) => { setMatches(m); setSearchError(null); })
        .catch((err) => setSearchError((err as Error).message));
    }, 300);
    return () => clearTimeout(t);
  }, [name, base]);

  return (
    <div className="flex flex-1 flex-col pb-4 pt-2">
      <button type="button" onClick={onBack} className="checkin-link self-start py-1 text-sm">← Back</button>
      <div className="checkin-enter mt-3 text-center">
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight">Find yourself by name</h1>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-[15px] text-[var(--checkin-muted)]">Type your name, then tap the one with your college.</p>
      </div>
      <div className="checkin-enter mt-5" style={{ '--i': 1 } as React.CSSProperties}>
        <CheckinField label="Your name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          autoComplete="name" autoCapitalize="words" autoFocus enterKeyHint="search" maxLength={60} placeholder="Like Harika Iyer"
          hint={letters > 0 && letters < 3 ? 'Keep typing…' : undefined} />
      </div>

      {searchError && <CheckinNotice>{searchError}</CheckinNotice>}
      {matches && matches.length > 0 && (
        <ul className="checkin-glass checkin-enter mt-3 divide-y divide-[var(--checkin-line)] overflow-hidden" aria-label="Matching registrations">
          {matches.map((m, i) => (
            <li key={`${m.name}-${m.schoolCollege}-${i}`}>
              <button type="button" disabled={!m.ref} onClick={() => m.ref && onPick(m.ref)}
                className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors enabled:hover:bg-white focus-visible:bg-white focus-visible:outline-none disabled:cursor-default">
                <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-extrabold ${
                  m.checkedIn ? 'bg-stone-100 text-stone-400' : 'bg-[var(--checkin-blush)] text-[var(--checkin-maroon)]'}`}>
                  {m.name.trim()[0]?.toUpperCase()}
                </span>
                <span className={`min-w-0 flex-1 ${m.checkedIn ? 'opacity-55' : ''}`}>
                  <span className="block truncate text-[15.5px] font-extrabold">{m.name}</span>
                  <span className="block truncate text-[13.5px] text-[var(--checkin-muted)]">{m.schoolCollege || 'College not given'}</span>
                </span>
                {m.checkedIn ? (
                  <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">Checked in</span>
                ) : (
                  <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--checkin-maroon)] transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {matches && matches.length > 0 && (
        <p className="checkin-enter mt-3 text-center text-sm text-[var(--checkin-muted)]">
          Not in the list? <button type="button" onClick={onRegister} className="checkin-link">Register now</button>
        </p>
      )}
      {matches && matches.length === 0 && (
        <div className="checkin-glass checkin-enter mt-3 px-5 py-5 text-center">
          <p className="text-[15px] font-extrabold">No one with that name yet</p>
          <p className="mt-1 text-sm text-[var(--checkin-muted)]">Try just your first name, or register now.</p>
          <div className="mt-4"><CheckinButton type="button" onClick={onRegister}>Register now</CheckinButton></div>
        </div>
      )}
    </div>
  );
}

/** A full-width option written in the student's own words ("I …"), so choosing needs no reading of instructions. */
function Choice({ i, title, text, icon, primary, onClick }: {
  i: number; title: string; text: string; icon: React.ReactNode; primary?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{ '--i': i } as React.CSSProperties}
      className={`checkin-enter group flex w-full items-center gap-3 rounded-[22px] px-3.5 py-3.5 text-left transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgb(165_9_37/0.25)] ${
        primary ? 'checkin-cta !justify-start !rounded-[22px] !px-3.5 !py-3.5' : 'checkin-glass'}`}>
      <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${primary ? 'bg-white/20 text-white' : 'bg-[var(--checkin-blush)] text-[var(--checkin-maroon)]'}`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15.5px] font-extrabold leading-snug ${primary ? 'text-white' : ''}`}>{title}</span>
        <span className={`mt-0.5 block text-[13.5px] font-medium ${primary ? 'text-white/80' : 'text-[var(--checkin-muted)]'}`}>{text}</span>
      </span>
      <svg aria-hidden viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1 ${primary ? 'text-white' : 'text-[var(--checkin-maroon)]'}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  );
}

const PHONE_OK = (v: string) => normalizePhone(v) !== null;

function StepHeader({ title, text }: { title: string; text: string }) {
  return (
    <div className="checkin-enter text-center">
      <img src={logo} alt="NIAT, NxtWave of Innovation in Advanced Technologies" className="mx-auto h-10 w-auto select-none" draggable={false} />
      <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-[32ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">{text}</p>
    </div>
  );
}

const FIELD_ORDER: (keyof Details)[] = ['name', 'parentName', 'parentPhone', 'schoolCollege', 'location', 'grade', 'stream', 'studyDetail', 'lunch'];

/** Brings the first field that failed into view and gives it one shake, so a miss is never hidden below the fold. */
function showFirstError(found: Partial<Record<keyof Details, string>>) {
  const key = FIELD_ORDER.find((k) => found[k]);
  if (!key) return;
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-field="${key}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('checkin-shake');
    void el.offsetWidth; // restart the animation if it is the same field again
    el.classList.add('checkin-shake');
  });
}

function DetailsStep({ screen, phone, onBack, onNext }: {
  screen: Extract<Screen, { kind: 'details' }>;
  phone: string;
  onBack: () => void;
  onNext: (details: Details) => void;
}) {
  const [form, setForm] = useState<Details>(screen.details);
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const needsParentPhone = !screen.known?.hasParentPhone;
  const savedParent = screen.known?.parentPhone ?? null;

  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: key === 'parentPhone' ? typedPhone(e.target.value) : e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };
  /** A tap on one of the choice rows. */
  const pick = (patch: Partial<Details>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof Details)[]) delete next[k];
      return next;
    });
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (form.name.trim().length < 2) found.name = 'Enter your full name.';
    if (needsParentPhone ? !PHONE_OK(form.parentPhone) : form.parentPhone && !PHONE_OK(form.parentPhone)) found.parentPhone = 'Enter a 10-digit mobile number.';
    else if (form.parentPhone && normalizePhone(form.parentPhone) === phone) found.parentPhone = 'Enter your parent’s number. It can’t be the same as yours.';
    if (form.parentName.trim().length < 2) found.parentName = 'Enter your parent’s name.';
    if (form.schoolCollege.trim().length < 2) found.schoolCollege = 'Enter your school or college.';
    if (form.location.trim().length < 2) found.location = 'Enter your location, like Madhapur or Warangal.';
    if (!form.grade) found.grade = 'Tap 12th or 11th.';
    if (!form.stream) found.stream = 'Choose your stream.';
    if (needsDetail(form) && form.studyDetail.trim().length < 2) found.studyDetail = form.grade === 'other' ? 'Type your class or course.' : 'Type your group.';
    if (!form.lunch) found.lunch = 'Tap Veg or Non-veg.';
    setErrors(found);
    if (Object.keys(found).length) return showFirstError(found);
    onNext({
      ...form,
      name: form.name.trim().replace(/\s+/g, ' '),
      parentName: form.parentName.trim().replace(/\s+/g, ' '),
      schoolCollege: form.schoolCollege.trim(),
      location: form.location.trim(),
      studyDetail: needsDetail(form) ? form.studyDetail.trim().replace(/\s+/g, ' ') : '',
    });
  };

  const [title, text] = screen.lookup === 'registered'
    ? ['Check your details', 'We found your registration. Fill in anything that’s missing.']
    : screen.lookup === 'returning'
      ? ['Welcome back', 'You’ve joined AI Bootcamp before. Check your details for this event.']
      : ['Great, you’re joining us!', 'Just a few details and you’ll get your seat.'];

  return (
    <div className="pb-4">
      <StepHeader title={title} text={text} />
      <form onSubmit={next} noValidate className="checkin-glass checkin-enter mt-6 space-y-4 p-5" style={{ '--i': 1 } as React.CSSProperties}>
        <div className="flex items-center justify-between rounded-2xl bg-[var(--checkin-blush)]/60 px-4 py-3">
          <div className="text-left">
            <div className="text-xs font-semibold text-[var(--checkin-muted)]">Mobile number</div>
            <div className="text-base font-bold tabular-nums">{prettyPhone(phone)}</div>
          </div>
          <button type="button" onClick={onBack} className="checkin-link px-2 py-1 text-sm">Change</button>
        </div>
        <CheckinField name="name" label="Full name" value={form.name} onChange={set('name')} error={errors.name}
          autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={100} />
        <CheckinField name="parentName" label="Parent’s name" value={form.parentName} onChange={set('parentName')} error={errors.parentName}
          hint="Your father’s, mother’s or guardian’s name." autoComplete="off" autoCapitalize="words" enterKeyHint="next" maxLength={100} />
        <CheckinField name="parentPhone" label="Parent’s mobile number" prefix="+91" type="tel" inputMode="numeric" value={form.parentPhone}
          placeholder={savedParent ? `••••• •${savedParent.slice(-4)}` : undefined}
          onChange={set('parentPhone')} error={errors.parentPhone} autoComplete="off" enterKeyHint="next"
          hint={digitsHint(form.parentPhone) ?? (savedParent ? `Saved number ends in ${savedParent.slice(-4)}. Leave it empty to keep it, or type a new one.` : undefined)} />
        <CheckinField name="schoolCollege" label="School or college" value={form.schoolCollege} onChange={set('schoolCollege')} error={errors.schoolCollege}
          autoComplete="organization" autoCapitalize="words" enterKeyHint="next" maxLength={150} />
        <CheckinField name="location" label="Location" value={form.location} onChange={set('location')} error={errors.location}
          hint="Your area or town, like Madhapur or Warangal." autoComplete="address-level2" autoCapitalize="words" enterKeyHint="done" maxLength={100} />
        <CheckinChoice name="grade" label="Current education" value={form.grade} options={GRADE_OPTIONS} error={errors.grade}
          onPick={(grade) => pick({ grade })} />
        <CheckinSelect name="stream" label="Educational stream" value={form.stream} options={STREAM_OPTIONS} error={errors.stream}
          placeholder="Select your stream" onPick={(stream) => pick({ stream })} />
        {needsDetail(form) && (
          <CheckinField name="studyDetail" label={form.grade === 'other' ? 'Your class or course' : 'Your group'} value={form.studyDetail} onChange={set('studyDetail')}
            error={errors.studyDetail} placeholder={form.grade === 'other' ? 'Like B.Tech 1st year or 10th' : 'Like HEC or Arts'}
            autoComplete="off" autoCapitalize="words" enterKeyHint="next" maxLength={100} />
        )}
        <CheckinChoice name="lunch" label="Lunch" value={form.lunch} options={LUNCH_OPTIONS} error={errors.lunch} onPick={(lunch) => pick({ lunch })} />
        <div className="pt-2"><CheckinButton type="submit">Review details</CheckinButton></div>
      </form>
    </div>
  );
}

function ConfirmStep({ screen, phone, onEdit, onBack, onConfirm }: {
  screen: Extract<Screen, { kind: 'confirm' }>;
  phone: string;
  onEdit: () => void;
  onBack: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const d = screen.details;
  const answers = answersOf(d)!;
  const rows: [string, string][] = [
    ['Name', d.name],
    ['Mobile', prettyPhone(phone)],
    ['School or college', d.schoolCollege],
    ['Class', classLabel(answers)],
    ['Location', d.location],
    ...(d.parentName ? [['Parent’s name', d.parentName] as [string, string]] : []),
    // Typed here, or the saved one (last 4 digits) so the student can check it and edit if it's wrong.
    ...(d.parentPhone || screen.known?.parentPhone
      ? [['Parent’s mobile', prettyPhone(d.parentPhone ? normalizePhone(d.parentPhone) ?? d.parentPhone : screen.known!.parentPhone!)] as [string, string]]
      : []),
    ['Lunch', LUNCH_LABEL[answers.lunch]],
  ];

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    await onConfirm();
    setBusy(false); // only matters when we stay on this screen to show an error
  };

  return (
    <div className="pb-4">
      {busy && <ProgressPopup title="Getting your seat" steps={['Saving your details', 'Finding your team', 'Reserving your seat']} />}
      <StepHeader title={screen.lookup === 'registered' ? 'Is this you?' : 'Confirm your details'} text="Your seat is reserved as soon as you confirm." />
      <div className="checkin-glass checkin-enter mt-6 p-5" style={{ '--i': 1 } as React.CSSProperties}>
        <dl className="divide-y divide-[var(--checkin-line)]">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-3 first:pt-0">
              <dt className="shrink-0 text-[13px] font-semibold text-[var(--checkin-muted)]">{label}</dt>
              <dd className="min-w-0 break-words text-right text-[15px] font-bold">{value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" onClick={onEdit} disabled={busy} className="checkin-link mt-2 px-1 py-1 text-sm">Edit details</button>
      </div>
      {screen.error && <CheckinNotice>{screen.error}</CheckinNotice>}
      <div className="checkin-enter mt-6 space-y-2 text-center" style={{ '--i': 2 } as React.CSSProperties}>
        <CheckinButton onClick={confirm} loading={busy} loadingLabel="Getting your seat">Confirm &amp; Get My Seat</CheckinButton>
        <button type="button" onClick={onBack} disabled={busy} className="checkin-link px-2 py-2 text-sm">Not you? Start again</button>
      </div>
    </div>
  );
}
