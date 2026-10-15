import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError, type SeatAssignment } from '../../lib/api';
import { atLeast } from '../../lib/device';
import { ProgressPopup } from '../../components/kiosk/ProgressPopup';
import { SeatReveal } from '../../components/kiosk/SeatReveal';
import { KioskShell } from '../../components/kiosk/Shell';
import {
  CheckinButton, CheckinField, CheckinNotice, CheckinShell, EventMeta, Seeker, Shield, StateCard,
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

type Kind = 'registered' | 'returning' | 'new';

type Screen =
  | { kind: 'entry'; error?: { message: string; retry: boolean } }
  | { kind: 'finding'; message: string }
  | { kind: 'not-found' }
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
const forgetPhone = (path: string) => { try { localStorage.removeItem(phoneKey(path)); } catch { /* storage unavailable */ } };

const emptyDetails: Details = { name: '', parentPhone: '', schoolCollege: '', className: '', location: '' };
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

  const loadEvent = useCallback(() => {
    setLoadError(null);
    api<PublicEvent>(base).then(setEvent).catch((err) => setLoadError(err as ApiError));
  }, [base]);
  useEffect(loadEvent, [loadEvent]);

  const lookup = (digits: string) => api<Lookup>(`${base}/lookup`, { body: { phone: digits } });

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
        name: k.name, parentPhone: '', schoolCollege: k.schoolCollege, className: k.className ?? '', location: k.location ?? '',
      };
      // A registered student whose details are complete only needs to confirm them.
      const complete = Boolean(details.name && details.schoolCollege && details.location && k.hasParentPhone);
      setScreen({ kind: complete && result.state === 'registered' ? 'confirm' : 'details', lookup: result.state, known: k, details });
    }
  }, [path]);

  // Reopening the link on the same phone goes straight back to the seat (or the waiting list).
  useEffect(() => {
    if (event?.status !== 'active') return;
    const saved = recallPhone(path);
    if (!saved) return;
    setPhone(saved);
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
    setScreen({ kind: 'entry' });
  };

  const findRegistration = async (digits: string) => {
    setScreen({ kind: 'finding', message: 'Finding your registration…' });
    try {
      route(digits, await atLeast(lookup(digits), 700));
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'EVENT_NOT_ACTIVE') return loadEvent();
      setScreen({ kind: 'entry', error: { message: e.message, retry: isNetwork(err) } });
    }
  };

  /** Confirm → seat. The confirm screen shows the "Getting your seat" pop-up while this runs. */
  const getSeat = async (s: Extract<Screen, { kind: 'confirm' }>) => {
    const digits = normalizePhone(phone)!;
    try {
      const assignment = await atLeast(api<SeatAssignment>(`${base}/checkin`, {
        body: { ...s.details, phone: digits, parentPhone: s.details.parentPhone || undefined },
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
            onRegister={() => setScreen({ kind: 'details', lookup: 'new', known: null, details: emptyDetails })} />
        </CheckinShell>
      );

    case 'details':
      return (
        <CheckinShell footer="entry">
          <DetailsStep screen={screen} phone={normalizePhone(phone) ?? ''} onBack={() => setScreen({ kind: 'entry' })}
            onNext={(details) => setScreen({ ...screen, kind: 'confirm', details, error: undefined })} />
        </CheckinShell>
      );

    case 'confirm':
      return (
        <CheckinShell footer="entry">
          <ConfirmStep screen={screen} phone={normalizePhone(phone) ?? ''}
            onEdit={() => setScreen({ ...screen, kind: 'details' })} onBack={() => setScreen({ kind: 'entry' })} onConfirm={() => getSeat(screen)} />
        </CheckinShell>
      );

    default:
      return (
        <CheckinShell footer="entry">
          <EntryStep event={event} phone={phone} setPhone={setPhone} error={screen.error} onSubmit={findRegistration} />
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
    <div className="flex flex-1 flex-col items-center text-center">
      <div {...step(0)}><Shield size={84} /></div>
      <h1 className="mt-4">
        <span {...step(1)} className="checkin-enter block text-[clamp(1.75rem,8vw,2.25rem)] font-bold tracking-tight text-[var(--checkin-ink)]">Welcome to</span>
        <span {...step(2)} className="checkin-enter mt-2 block">
          <span className="checkin-wordmark block">AI<br />BOOTCAMP</span>
        </span>
      </h1>
      <div {...step(3)} className="checkin-enter mt-5">
        <EventMeta place={event.locationName} date={eventDate(event.date)} />
      </div>

      <form onSubmit={submit} noValidate className="mt-8 w-full">
        <div {...step(4)} className="checkin-enter">
          <h2 className="text-[22px] font-extrabold tracking-tight">Your seat is waiting.</h2>
          <p className="mx-auto mt-1.5 max-w-[30ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">
            Enter the mobile number you used when you registered. We’ll find your details and give you your seat and team.
          </p>
        </div>
        <div {...step(5)} className="checkin-enter mt-5">
          <CheckinField label="Registered mobile number" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14}
            placeholder="98765 43210" value={phone} enterKeyHint="go"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPhone(e.target.value); setInvalid(null); }}
            error={invalid ?? undefined} hint={invalid ? undefined : 'Use the same number you gave at registration.'} />
        </div>
        {error && (
          <CheckinNotice action={error.retry && digits ? (
            <button type="submit" className="checkin-link shrink-0">Retry</button>
          ) : undefined}>
            {error.retry ? 'No connection. Your number is kept, so you can retry.' : error.message}
          </CheckinNotice>
        )}
        <div {...step(6)} className="checkin-enter mt-5">
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
function NotFoundStep({ phone, onRetry, onRegister }: { phone: string; onRetry: () => void; onRegister: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center pb-6">
      <div className="checkin-glass checkin-enter px-6 py-8 text-center">
        <Shield size={52} className="mx-auto" />
        <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-tight">We couldn’t find your registration</h1>
        <p className="mx-auto mt-3 max-w-[32ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">
          No registration matches <strong className="whitespace-nowrap text-[var(--checkin-ink)]">{prettyPhone(phone)}</strong>.
        </p>

        <div className="mt-6 rounded-2xl bg-white/80 p-4 text-left ring-1 ring-[var(--checkin-line)]">
          <h2 className="text-base font-extrabold">Already registered?</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--checkin-muted)]">
            Check that this is the mobile number you used when you registered, then try again with that number.
          </p>
          <button type="button" onClick={onRetry} className="checkin-ghost mt-3">Try my registered number</button>
        </div>

        <div className="mt-3 rounded-2xl bg-white/80 p-4 text-left ring-1 ring-[var(--checkin-line)]">
          <h2 className="text-base font-extrabold">New participant?</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--checkin-muted)]">
            If you came to the event without registering, register now. It takes about a minute.
          </p>
          <div className="mt-3"><CheckinButton onClick={onRegister}>Register now</CheckinButton></div>
        </div>
      </div>
    </div>
  );
}

const PHONE_OK = (v: string) => normalizePhone(v) !== null;

function StepHeader({ title, text }: { title: string; text: string }) {
  return (
    <div className="checkin-enter text-center">
      <Shield size={48} className="mx-auto" />
      <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
      <p className="mx-auto mt-1.5 max-w-[32ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">{text}</p>
    </div>
  );
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

  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: e.target.value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (form.name.trim().length < 2) found.name = 'Enter your full name.';
    if (needsParentPhone ? !PHONE_OK(form.parentPhone) : form.parentPhone && !PHONE_OK(form.parentPhone)) found.parentPhone = 'Enter a 10-digit mobile number.';
    if (form.schoolCollege.trim().length < 2) found.schoolCollege = 'Enter your school or college.';
    if (form.location.trim().length < 2) found.location = 'Enter the area you’re coming from.';
    setErrors(found);
    if (Object.keys(found).length) return;
    onNext({
      ...form,
      name: form.name.trim().replace(/\s+/g, ' '),
      schoolCollege: form.schoolCollege.trim(),
      location: form.location.trim(),
      className: form.className.trim(),
    });
  };

  const [title, text] = screen.lookup === 'registered'
    ? ['Check your details', 'We found your registration. Fill in anything that’s missing.']
    : screen.lookup === 'returning'
      ? ['Welcome back', 'You’ve joined AI Bootcamp before. Check your details for this event.']
      : ['Register for AI Bootcamp', 'Tell us a little about you to get your seat.'];

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
        <CheckinField label="Full name" value={form.name} onChange={set('name')} error={errors.name}
          autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={100} />
        {needsParentPhone ? (
          <CheckinField label="Parent’s mobile number" prefix="+91" type="tel" inputMode="numeric" value={form.parentPhone}
            onChange={set('parentPhone')} error={errors.parentPhone} autoComplete="off" maxLength={14} enterKeyHint="next" />
        ) : (
          <p className="pl-1 text-left text-sm text-[var(--checkin-muted)]">Parent’s mobile number is already on file.</p>
        )}
        <CheckinField label="School or college" value={form.schoolCollege} onChange={set('schoolCollege')} error={errors.schoolCollege}
          autoComplete="organization" autoCapitalize="words" enterKeyHint="next" maxLength={150} />
        <CheckinField label="Class (optional)" value={form.className} onChange={set('className')} autoComplete="off" enterKeyHint="next" maxLength={40} />
        <CheckinField label="Area you’re coming from" value={form.location} onChange={set('location')} error={errors.location}
          hint="For example Madhapur, Gachibowli or Warangal." autoComplete="address-level2" autoCapitalize="words" enterKeyHint="done" maxLength={100} />
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
  const rows: [string, string][] = [
    ['Name', d.name],
    ['Mobile', prettyPhone(phone)],
    ['School or college', d.schoolCollege],
    ...(d.className ? [['Class', d.className] as [string, string]] : []),
    ['Coming from', d.location],
    ['Parent’s mobile', d.parentPhone ? prettyPhone(normalizePhone(d.parentPhone) ?? d.parentPhone) : 'On file'],
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
