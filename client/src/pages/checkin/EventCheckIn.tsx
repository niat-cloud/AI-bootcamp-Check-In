import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, formatDate, type SeatAssignment } from '../../lib/api';
import { atLeast } from '../../lib/device';
import { CtaButton, LoadingDots } from '../../components/kiosk/CtaButton';
import { FloatingInput, Notice } from '../../components/kiosk/Form';
import { ProgressPopup } from '../../components/kiosk/ProgressPopup';
import { SeatReveal } from '../../components/kiosk/SeatReveal';
import { CalmCard, KioskShell } from '../../components/kiosk/Shell';

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
  phone: string; // masked
}

type Lookup =
  | { state: 'seated'; assignment: SeatAssignment }
  | { state: 'waiting' | 'registered' | 'returning'; participant: KnownStudent }
  | { state: 'new'; phone: string };

interface Details {
  name: string;
  parentPhone: string;
  schoolCollege: string;
  className: string;
  location: string;
}

type Screen =
  | { kind: 'phone' }
  | { kind: 'details'; lookup: 'registered' | 'returning' | 'new'; known: KnownStudent | null; details: Details }
  | { kind: 'confirm'; lookup: 'registered' | 'returning' | 'new'; known: KnownStudent | null; details: Details }
  | { kind: 'seat'; assignment: SeatAssignment }
  | { kind: 'waiting'; name: string };

/** 98765 43210, +91 98765 43210, 098765 43210 → 9876543210 (or null). */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

// This phone remembers who checked in on it, so reopening the link shows the seat again.
const phoneKey = (path: string) => `aibootcamp.phone.${path}`;
const recallPhone = (path: string) => { try { return localStorage.getItem(phoneKey(path)); } catch { return null; } };
const rememberPhone = (path: string, phone: string) => { try { localStorage.setItem(phoneKey(path), phone); } catch { /* storage unavailable */ } };
const forgetPhone = (path: string) => { try { localStorage.removeItem(phoneKey(path)); } catch { /* storage unavailable */ } };

const emptyDetails: Details = { name: '', parentPhone: '', schoolCollege: '', className: '', location: '' };

/**
 * The page students open from the QR code: /hyderabad/18-oct-2026.
 * Phone number → (confirm or fill in details) → confirm → seat.
 */
export default function EventCheckIn() {
  const { location = '', slug = '' } = useParams();
  const base = `/public/events/${encodeURIComponent(location)}/${encodeURIComponent(slug)}`;
  const path = `${location}/${slug}`.toLowerCase();

  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [restoring, setRestoring] = useState(false);

  const loadEvent = useCallback(() => {
    setLoadError(null);
    api<PublicEvent>(base).then(setEvent).catch((err) => setLoadError(err as ApiError));
  }, [base]);
  useEffect(loadEvent, [loadEvent]);

  /** Turns a lookup result into the next screen. */
  const route = useCallback((digits: string, result: Lookup) => {
    if (result.state === 'seated') {
      rememberPhone(path, digits);
      setScreen({ kind: 'seat', assignment: result.assignment });
    } else if (result.state === 'waiting') {
      setScreen({ kind: 'waiting', name: result.participant.name });
    } else if (result.state === 'new') {
      setScreen({ kind: 'details', lookup: 'new', known: null, details: emptyDetails });
    } else {
      const k = result.participant;
      const details: Details = {
        name: k.name, parentPhone: '', schoolCollege: k.schoolCollege, className: k.className ?? '', location: k.location ?? '',
      };
      // A registered student with complete details only needs to confirm them.
      const complete = details.name && details.schoolCollege && details.location && k.hasParentPhone;
      setScreen({ kind: complete && result.state === 'registered' ? 'confirm' : 'details', lookup: result.state, known: k, details });
    }
  }, [path]);

  // Reopening the link on the same phone goes straight back to the seat.
  useEffect(() => {
    if (event?.status !== 'active') return;
    const saved = recallPhone(path);
    if (!saved) return;
    setRestoring(true);
    setPhone(saved);
    api<Lookup>(`${base}/lookup`, { body: { phone: saved } })
      .then((r) => { if (r.state === 'seated') route(saved, r); else forgetPhone(path); })
      .catch(() => forgetPhone(path))
      .finally(() => setRestoring(false));
  }, [event?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    forgetPhone(path);
    setPhone('');
    setScreen({ kind: 'phone' });
  };

  /** Known API states become full screens; anything else is shown inline by the caller. */
  const handleError = (err: unknown, name?: string) => {
    const e = err as ApiError;
    if (e.code === 'VENUE_FULL') setScreen({ kind: 'waiting', name: name ?? '' });
    else if (e.code === 'EVENT_NOT_ACTIVE') loadEvent();
    else throw err;
  };

  if (loadError) {
    const notFound = loadError.status === 404;
    return (
      <KioskShell>
        <CalmCard icon={notFound ? '🔍' : '📶'}
          title={notFound ? "We couldn't find this event" : 'Connection problem'}
          message={notFound ? 'Check the link, or scan the QR code at the venue again.' : loadError.message}
          action={!notFound && <CtaButton variant="ghost" size="md" arrow={false} onClick={loadEvent}>Try again</CtaButton>} />
      </KioskShell>
    );
  }

  if (!event || restoring) {
    return <KioskShell><div className="grid flex-1 place-items-center text-niat-muted"><LoadingDots label={restoring ? 'Finding your seat' : 'Getting things ready'} /></div></KioskShell>;
  }

  if (event.status !== 'active') {
    return (
      <KioskShell date={event.date} place={event.locationName}>
        {event.status === 'draft' ? (
          <CalmCard icon="🗓️" title="Check-in opens soon"
            message={<>Check-in for <strong>{event.name}</strong> in {event.locationName} opens on {formatDate(event.date)}{event.time ? ` at ${event.time}` : ''}. Open this link again when you arrive.</>}
            action={<CtaButton variant="ghost" size="md" arrow={false} onClick={loadEvent}>Refresh</CtaButton>} />
        ) : (
          <CalmCard icon="🌙" title="This event has ended" message="Check-in is closed. Thank you for being part of AI Bootcamp!" />
        )}
      </KioskShell>
    );
  }

  return (
    <KioskShell date={event.date} place={event.locationName} onHome={screen.kind === 'seat' ? undefined : restart}>
      {screen.kind === 'phone' && (
        <PhoneStep event={event} phone={phone} setPhone={setPhone}
          onFound={(digits, result) => route(digits, result)} lookup={(digits) => api<Lookup>(`${base}/lookup`, { body: { phone: digits } })}
          onError={handleError} />
      )}
      {screen.kind === 'details' && (
        <DetailsStep screen={screen} phone={phone} onBack={restart}
          onNext={(details) => setScreen({ ...screen, kind: 'confirm', details })} />
      )}
      {screen.kind === 'confirm' && (
        <ConfirmStep screen={screen} phone={phone} onEdit={() => setScreen({ ...screen, kind: 'details' })} onBack={restart}
          submit={() => api<SeatAssignment>(`${base}/checkin`, {
            body: { ...screen.details, phone: normalizePhone(phone), parentPhone: screen.details.parentPhone || undefined },
          })}
          onSeated={(assignment) => { rememberPhone(path, normalizePhone(phone)!); setScreen({ kind: 'seat', assignment }); }}
          onError={(err) => handleError(err, screen.details.name)} />
      )}
      {screen.kind === 'seat' && <SeatReveal assignment={screen.assignment} mode="personal" onDone={restart} />}
      {screen.kind === 'waiting' && (
        <CalmCard icon="🙏" title="You're on the waiting list"
          message={<>{screen.name ? `${screen.name.split(/\s+/)[0]}, you're` : "You're"} checked in, but every seat is taken right now. Please wait near the help desk. An organizer will give you a seat shortly.</>}
          action={<CtaButton variant="ghost" size="md" arrow={false} onClick={restart}>Done</CtaButton>} />
      )}
    </KioskShell>
  );
}

function PhoneStep({ event, phone, setPhone, lookup, onFound, onError }: {
  event: PublicEvent;
  phone: string;
  setPhone: (v: string) => void;
  lookup: (digits: string) => Promise<Lookup>;
  onFound: (digits: string, result: Lookup) => void;
  onError: (err: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = normalizePhone(phone);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!digits) {
      setError('Enter your 10-digit mobile number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onFound(digits, await atLeast(lookup(digits), 400));
    } catch (err) {
      setBusy(false);
      try { onError(err); } catch { setError((err as Error).message); }
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center pt-4 text-center sm:pt-12">
      <div className="eyebrow animate-fade-up">NIAT presents</div>
      <h1 className="mt-3 animate-fade-up font-extrabold leading-[0.95] tracking-tight">
        <span className="block text-2xl font-bold text-niat-muted sm:text-3xl">Welcome to</span>
        <span className="mt-1 block bg-gradient-to-br from-niat-maroon via-niat-maroon to-niat-maroon-dark bg-clip-text text-[44px] text-transparent sm:text-7xl">
          AI BOOTCAMP
        </span>
      </h1>
      <p className="mt-4 animate-fade-up text-lg font-bold text-niat-text sm:text-xl">📍 {event.locationName} · {formatDate(event.date)}</p>
      <p className="mt-1 animate-fade-up text-base text-niat-muted">Enter your mobile number to get your seat.</p>

      <form onSubmit={submit} noValidate className="mt-7 w-full animate-scale-in text-left">
        <FloatingInput label="Your mobile number" type="tel" inputMode="numeric" autoComplete="tel" maxLength={16}
          value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} valid={Boolean(digits)}
          error={error ?? undefined} hint="The number you registered with. New here? Use your own number." enterKeyHint="go" />
        <CtaButton type="submit" loading={busy} loadingLabel="Looking you up" className="mt-5 w-full">Continue</CtaButton>
      </form>
      <p className="mt-6 text-xs text-niat-muted">We use your number only to find your registration for this event.</p>
    </div>
  );
}

const PHONE_OK = (v: string) => normalizePhone(v) !== null;

function DetailsStep({ screen, phone, onBack, onNext }: {
  screen: Extract<Screen, { kind: 'details' }>;
  phone: string;
  onBack: () => void;
  onNext: (details: Details) => void;
}) {
  const [form, setForm] = useState<Details>(screen.details);
  const [errors, setErrors] = useState<Partial<Record<keyof Details, string>>>({});
  const needsParentPhone = !screen.known?.hasParentPhone;
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (screen.lookup === 'new') firstRef.current?.focus(); }, [screen.lookup]);

  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  const ok = {
    name: form.name.trim().length >= 2,
    schoolCollege: form.schoolCollege.trim().length >= 2,
    location: form.location.trim().length >= 2,
    parentPhone: needsParentPhone ? PHONE_OK(form.parentPhone) : !form.parentPhone || PHONE_OK(form.parentPhone),
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (!ok.name) found.name = 'Please enter your full name';
    if (!ok.parentPhone) found.parentPhone = 'Enter a valid 10-digit mobile number';
    if (!ok.location) found.location = "Please enter the area you're coming from";
    if (!ok.schoolCollege) found.schoolCollege = 'Please enter your school or college';
    setErrors(found);
    if (Object.keys(found).length === 0) {
      onNext({ ...form, name: form.name.trim().replace(/\s+/g, ' '), schoolCollege: form.schoolCollege.trim(), location: form.location.trim(), className: form.className.trim() });
    }
  };

  const heading = screen.lookup === 'registered' ? ['We found you! 👋', 'Check your details and fix anything that has changed.']
    : screen.lookup === 'returning' ? ['Welcome back! 👋', "You've been to AI Bootcamp before. Confirm your details for today."]
    : ["Let's get you registered", 'Fill in your details to get your seat.'];

  return (
    <div className="mx-auto w-full max-w-xl pb-28 pt-1 text-center sm:pb-0 sm:pt-6">
      <div className="eyebrow animate-fade-up">Step 2 of 3 · Your details</div>
      <h1 className="mt-2 animate-fade-up text-3xl font-extrabold tracking-tight sm:text-5xl">{heading[0]}</h1>
      <p className="mt-2 animate-fade-up text-base text-niat-muted sm:text-lg">{heading[1]}</p>

      <form id="details-form" onSubmit={next} noValidate
        className="mt-6 animate-scale-in space-y-4 rounded-[var(--radius-card)] border border-niat-line bg-white/90 p-5 text-left shadow-[var(--shadow-card)] backdrop-blur sm:p-8">
        <div className="flex items-center justify-between rounded-2xl bg-niat-warm-white px-4 py-3 ring-1 ring-niat-line">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-niat-muted">Mobile number</div>
            <div className="font-mono text-lg font-semibold tracking-wider">{normalizePhone(phone)}</div>
          </div>
          <button type="button" onClick={onBack} className="cursor-pointer text-sm font-bold text-niat-maroon hover:underline">Change</button>
        </div>
        <FloatingInput ref={firstRef} label="Full Name" value={form.name} onChange={set('name')} error={errors.name} valid={ok.name}
          autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={100} />
        {needsParentPhone ? (
          <FloatingInput label="Parent Phone Number" type="tel" inputMode="numeric" value={form.parentPhone} onChange={set('parentPhone')}
            error={errors.parentPhone} valid={ok.parentPhone && Boolean(form.parentPhone)} autoComplete="off" maxLength={16} enterKeyHint="next" />
        ) : (
          <p className="px-1 text-sm text-niat-muted">✓ Parent phone number is already on file.</p>
        )}
        <FloatingInput label="School / College" value={form.schoolCollege} onChange={set('schoolCollege')} error={errors.schoolCollege}
          valid={ok.schoolCollege} autoComplete="organization" autoCapitalize="words" enterKeyHint="next" maxLength={150} />
        <FloatingInput label="Class (optional)" value={form.className} onChange={set('className')} autoComplete="off" enterKeyHint="next" maxLength={40} />
        <FloatingInput label="The area you're coming from" value={form.location} onChange={set('location')} error={errors.location}
          valid={ok.location} autoComplete="address-level2" autoCapitalize="words" hint="e.g. Madhapur, Gachibowli, Warangal" enterKeyHint="done" maxLength={100} />
        <div className="hidden pt-2 sm:block">
          <CtaButton type="submit" className="w-full">Review My Details</CtaButton>
        </div>
      </form>
      <button type="button" onClick={onBack}
        className="mt-4 cursor-pointer rounded-lg px-3 py-2 font-semibold text-niat-muted transition-colors hover:text-niat-maroon">
        ← Use a different number
      </button>
      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-niat-line bg-white/85 px-5 pt-3 backdrop-blur-md sm:hidden">
        <CtaButton type="submit" form="details-form" className="w-full">Review My Details</CtaButton>
      </div>
    </div>
  );
}

function ConfirmStep({ screen, phone, onEdit, onBack, submit, onSeated, onError }: {
  screen: Extract<Screen, { kind: 'confirm' }>;
  phone: string;
  onEdit: () => void;
  onBack: () => void;
  submit: () => Promise<SeatAssignment>;
  onSeated: (a: SeatAssignment) => void;
  onError: (err: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = screen.details;

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onSeated(await atLeast(submit(), 900));
    } catch (err) {
      setBusy(false);
      try { onError(err); } catch { setError((err as Error).message); }
    }
  };

  const rows: [string, string][] = [
    ['Name', d.name],
    ['Mobile', normalizePhone(phone) ?? ''],
    ['School / College', d.schoolCollege],
    ...(d.className ? [['Class', d.className] as [string, string]] : []),
    ['Coming from', d.location],
    ['Parent phone', d.parentPhone ? normalizePhone(d.parentPhone) ?? d.parentPhone : 'On file'],
  ];

  return (
    <div className="mx-auto w-full max-w-xl pb-40 pt-1 text-center sm:pb-0 sm:pt-6">
      {busy && <ProgressPopup title="Getting your seat" steps={['Saving your details', 'Finding your team', 'Reserving your seat']} />}
      <div className="eyebrow animate-fade-up">Step 3 of 3 · Confirm</div>
      <h1 className="mt-2 animate-fade-up text-3xl font-extrabold tracking-tight sm:text-5xl">Is everything right?</h1>
      <p className="mt-2 animate-fade-up text-base text-niat-muted sm:text-lg">Your seat is assigned as soon as you confirm.</p>

      <div className="relative mt-6 animate-scale-in overflow-hidden rounded-[var(--radius-card)] border border-niat-line bg-white p-5 text-left shadow-[var(--shadow-card)] sm:p-8">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-niat-maroon via-niat-maroon to-niat-gold" />
        <dl className="divide-y divide-niat-line/70">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-niat-muted">{label}</dt>
              <dd className="min-w-0 break-words text-right text-base font-semibold text-niat-text">{value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" onClick={onEdit} disabled={busy} className="mt-3 cursor-pointer text-sm font-bold text-niat-maroon hover:underline disabled:opacity-40">
          ✎ Edit details
        </button>
      </div>

      {error && <div className="mt-5"><Notice>{error}</Notice></div>}

      <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-niat-line bg-white/85 px-5 pt-3 backdrop-blur-md sm:static sm:mt-7 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <CtaButton onClick={go} loading={busy} loadingLabel="Finding your seat" className="w-full" autoFocus>
          Confirm &amp; Get My Seat
        </CtaButton>
        <button onClick={onBack} disabled={busy}
          className="mt-1 w-full cursor-pointer rounded-lg px-3 py-2 font-semibold text-niat-muted transition-colors hover:text-niat-maroon disabled:opacity-40 sm:mt-4 sm:w-auto">
          Not you? Start again
        </button>
      </div>
    </div>
  );
}
