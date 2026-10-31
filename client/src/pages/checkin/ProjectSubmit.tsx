import { useCallback, useEffect, useId, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { atLeast } from '../../lib/device';
import {
  CheckinButton, CheckinField, CheckinNotice, CheckinShell, Seeker, Shield, StateCard,
} from '../../components/checkin/CheckinUI';

type RoomStatus = 'not_open' | 'open' | 'closed';

interface PublicRoom {
  id: number;
  name: string;
  status: RoomStatus;
  deadline: string | null;
  teams: { id: number; teamNumber: number; name: string; members: number; submitted: boolean }[];
}

interface Submission {
  projectName: string;
  theme: string;
  problemStatement: string;
  projectUrl: string;
  submittedAt: string;
  updatedAt: string;
  isLate: boolean;
  submittedBy: string | null;
}

interface TeamInfo {
  team: { id: number; teamNumber: number; name: string; room: string };
  roomStatus: RoomStatus;
  deadline: string | null;
  members: { id: number; name: string; seat: string }[];
  submission: Submission | null;
  themes: string[];
}

interface Form {
  projectName: string;
  theme: string;
  problemStatement: string;
  projectUrl: string;
}

type Screen =
  | { kind: 'loading' }
  | { kind: 'rooms' }
  | { kind: 'teams'; roomId: number }
  | { kind: 'team'; info: TeamInfo }
  | { kind: 'verify'; info: TeamInfo; memberId: number }
  | { kind: 'form'; info: TeamInfo; memberId: number; phone: string }
  | { kind: 'done'; info: TeamInfo };

// This phone remembers its team, so reopening the page goes straight back to it.
const teamKey = (path: string) => `aibootcamp.project.${path}`;
const recallTeam = (path: string): number | null => {
  try { return Number(localStorage.getItem(teamKey(path))) || null; } catch { return null; }
};
const rememberTeam = (path: string, teamId: number) => { try { localStorage.setItem(teamKey(path), String(teamId)); } catch { /* storage unavailable */ } };
const forgetTeam = (path: string) => { try { localStorage.removeItem(teamKey(path)); } catch { /* storage unavailable */ } };

// The number this phone checked in with (saved by the check-in page), to fill in "Confirm it's you".
const recallCheckinPhone = (path: string) => { try { return localStorage.getItem(`aibootcamp.phone.${path}`) ?? ''; } catch { return ''; } };

/** 98765 43210, +91 98765 43210, 098765 43210 → 9876543210 (or null). */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

/**
 * "Submit by 4:30 PM · 12 min left". In the last 5 minutes it turns red and stays pinned to the top of the
 * screen while the student scrolls through the form; after the deadline it says submissions are marked late.
 */
function Deadline({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  const left = Math.ceil(ms / 60_000);
  const urgent = ms > 0 && left <= 5;
  const secs = Math.max(0, Math.ceil(ms / 1000));
  // The page wrapper clips horizontal overflow, which stops `position: sticky` from pinning, so the
  // pinned banner is fixed to the screen and leaves an equal-height spacer in the page.
  const pinned = ms <= 0 || urgent;
  return (
    <>
    {pinned && <div aria-hidden className="mt-4 h-[52px]" />}
    <div role={urgent ? 'alert' : undefined}
      className={`rounded-2xl px-4 py-3 text-center text-sm font-bold ring-1 ${pinned
        ? 'fixed left-1/2 top-[max(0.5rem,env(safe-area-inset-top))] z-30 w-[calc(100%-1.5rem)] max-w-[406px] -translate-x-1/2 shadow-lg' : 'mt-4'} ${urgent
        ? 'bg-[var(--checkin-maroon)] text-white ring-[var(--checkin-maroon-deep)]'
        : ms > 0
          ? 'bg-white/80 text-[var(--checkin-ink)] ring-[var(--checkin-line)]'
          : 'bg-[var(--checkin-blush)] text-[#7A0619] ring-[rgb(165_9_37/0.15)]'}`}>
      {urgent
        ? <>⏰ Only {secs < 60 ? `${secs} seconds` : `${left} min`} left! Submit by {clock(deadline)}</>
        : ms > 0
          ? <>Submit by {clock(deadline)} · {left} min left</>
          : <>The deadline ({clock(deadline)}) has passed. Submit now: late projects are marked late.</>}
    </div>
    </>
  );
}

function Header({ title, text }: { title: string; text?: string }) {
  return (
    <div className="checkin-enter text-center">
      <Shield size={48} className="mx-auto" />
      <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--checkin-maroon)]">Project submission</p>
      <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
      {text && <p className="mx-auto mt-1.5 max-w-[32ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">{text}</p>}
    </div>
  );
}

const closedText = (status: RoomStatus) => status === 'not_open'
  ? 'Submissions for this room haven’t opened yet. Your instructor will tell you when to submit.'
  : 'Submissions for this room are closed. If your team hasn’t submitted, talk to your instructor.';

/**
 * The page instructors show on the classroom screen at build time, e.g. /hyderabad/18-oct-2026/project:
 * room → team → "who's submitting?" → project details and link → submitted.
 * A room-specific QR code adds ?room=ID and skips the room step.
 */
export default function ProjectSubmit() {
  const { location = '', slug = '' } = useParams();
  const [search] = useSearchParams();
  const base = `/public/events/${encodeURIComponent(location)}/${encodeURIComponent(slug)}`;
  const path = `${location}/${slug}`.toLowerCase();
  const presetRoom = Number(search.get('room')) || null;

  const [rooms, setRooms] = useState<PublicRoom[] | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    const data = await api<{ rooms: PublicRoom[] }>(`${base}/projects`);
    setRooms(data.rooms);
    return data.rooms;
  }, [base]);

  const openTeam = useCallback(async (teamId: number) => {
    setError(null);
    const info = await api<TeamInfo>(`${base}/projects/teams/${teamId}`);
    rememberTeam(path, teamId);
    setScreen({ kind: 'team', info });
  }, [base, path]);

  const start = useCallback(async () => {
    setLoadError(null);
    setScreen({ kind: 'loading' });
    try {
      const list = await loadRooms();
      const saved = recallTeam(path);
      if (saved && list.some((r) => r.teams.some((t) => t.id === saved))) {
        await openTeam(saved);
        return;
      }
      const preset = list.find((r) => r.id === presetRoom);
      if (preset) setScreen({ kind: 'teams', roomId: preset.id });
      else if (list.length === 1) setScreen({ kind: 'teams', roomId: list[0]!.id });
      else setScreen({ kind: 'rooms' });
    } catch (err) {
      setLoadError(err as ApiError);
    }
  }, [loadRooms, openTeam, path, presetRoom]);

  useEffect(() => { start(); }, [start]);

  const backToTeams = async (roomName?: string) => {
    forgetTeam(path);
    const list = await loadRooms().catch(() => rooms ?? []);
    const room = list.find((r) => r.name === roomName) ?? list.find((r) => r.id === presetRoom);
    setScreen(room ? { kind: 'teams', roomId: room.id } : list.length === 1 ? { kind: 'teams', roomId: list[0]!.id } : { kind: 'rooms' });
  };

  if (loadError) {
    const code = loadError.code;
    return (
      <CheckinShell footer="help">
        <StateCard
          title={code === 'EVENT_NOT_ACTIVE' ? 'This event isn’t live' : loadError.status === 404 ? 'This link doesn’t exist' : 'Can’t reach the event'}
          actions={code !== 'EVENT_NOT_ACTIVE' && loadError.status !== 404 && <CheckinButton onClick={start} arrow={false}>Try again</CheckinButton>}>
          {loadError.status === 0 ? 'Check your internet connection, then try again.' : loadError.message}
        </StateCard>
      </CheckinShell>
    );
  }

  switch (screen.kind) {
    case 'loading':
      return <CheckinShell footer="none"><Seeker message="Loading your event…" /></CheckinShell>;

    case 'rooms':
      return (
        <CheckinShell footer="help">
          <Header title="Which room are you in?" text="Choose the room your team is sitting in." />
          <div className="mt-6 space-y-3 pb-4">
            {(rooms ?? []).map((room, i) => (
              <button key={room.id} type="button" onClick={() => setScreen({ kind: 'teams', roomId: room.id })}
                className="checkin-glass checkin-enter flex w-full items-center justify-between px-5 py-4 text-left"
                style={{ '--i': i + 1 } as React.CSSProperties}>
                <span>
                  <span className="block text-lg font-extrabold">{room.name}</span>
                  <span className="text-sm text-[var(--checkin-muted)]">
                    {room.teams.filter((t) => t.submitted).length} of {room.teams.length} teams submitted
                  </span>
                </span>
                <span aria-hidden className="text-xl text-[var(--checkin-maroon)]">→</span>
              </button>
            ))}
          </div>
        </CheckinShell>
      );

    case 'teams': {
      const room = rooms?.find((r) => r.id === screen.roomId);
      if (!room) return null;
      return (
        <CheckinShell footer="help">
          <Header title={room.name} text="Tap your team number. It’s on your seat card from check-in." />
          {room.status === 'open'
            ? <Deadline deadline={room.deadline} />
            : <CheckinNotice>{closedText(room.status)}</CheckinNotice>}
          {error && <CheckinNotice>{error}</CheckinNotice>}
          <div className="checkin-enter mt-5 grid grid-cols-3 gap-2.5 pb-4" style={{ '--i': 1 } as React.CSSProperties}>
            {room.teams.map((team) => (
              <button key={team.id} type="button"
                onClick={() => openTeam(team.id).catch((err) => setError((err as ApiError).message))}
                className={`relative flex min-h-[76px] flex-col items-center justify-center rounded-2xl px-2 py-3 ring-1 transition-transform active:scale-95 ${team.submitted
                  ? 'bg-emerald-50 ring-emerald-300' : 'bg-white/85 ring-[var(--checkin-line)]'}`}>
                <span className="text-xs font-bold text-[var(--checkin-muted)]">{team.name.replace(/\s*\d+$/, '')}</span>
                <span className="text-2xl font-extrabold tabular-nums">{team.teamNumber}</span>
                {team.submitted && <span className="text-[11px] font-bold text-emerald-700">✓ Submitted</span>}
              </button>
            ))}
          </div>
          {(rooms?.length ?? 0) > 1 && (
            <div className="pb-2 text-center">
              <button type="button" onClick={() => setScreen({ kind: 'rooms' })} className="checkin-link px-2 py-2 text-sm">Change room</button>
            </div>
          )}
        </CheckinShell>
      );
    }

    case 'team':
      return (
        <CheckinShell footer="help">
          <TeamStep info={screen.info}
            onNotMine={() => backToTeams(screen.info.team.room)}
            onPick={(memberId) => setScreen({ kind: 'verify', info: screen.info, memberId })} />
        </CheckinShell>
      );

    case 'verify':
      return (
        <CheckinShell footer="entry">
          <VerifyStep info={screen.info} memberId={screen.memberId} initialPhone={recallCheckinPhone(path)}
            onBack={() => setScreen({ kind: 'team', info: screen.info })}
            onVerify={async (phone) => {
              await atLeast(api(`${base}/projects/teams/${screen.info.team.id}/verify`, { body: { memberId: screen.memberId, phone } }), 500);
              setScreen({ kind: 'form', info: screen.info, memberId: screen.memberId, phone });
            }} />
        </CheckinShell>
      );

    case 'form':
      return (
        <CheckinShell footer="help">
          <FormStep info={screen.info} memberId={screen.memberId}
            onBack={() => setScreen({ kind: 'team', info: screen.info })}
            onSubmit={async (form) => {
              const result = await atLeast(api<TeamInfo>(`${base}/projects/teams/${screen.info.team.id}`, {
                body: { ...form, memberId: screen.memberId, phone: screen.phone },
              }), 900);
              setScreen({ kind: 'done', info: result });
            }}
            onAlreadySubmitted={() => openTeam(screen.info.team.id).catch(() => setScreen({ kind: 'team', info: screen.info }))} />
        </CheckinShell>
      );

    case 'done':
      return (
        <CheckinShell footer="help">
          <DoneStep info={screen.info} />
        </CheckinShell>
      );
  }
}

/**
 * "Is this really you?" The student who tapped a name enters the mobile number they checked in with,
 * so nobody can submit a project for a team they aren't on.
 */
function VerifyStep({ info, memberId, initialPhone, onBack, onVerify }: {
  info: TeamInfo;
  memberId: number;
  initialPhone: string;
  onBack: () => void;
  onVerify: (phone: string) => Promise<void>;
}) {
  const member = info.members.find((m) => m.id === memberId);
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const digits = normalizePhone(phone);
    if (!digits) {
      setError('Enter a valid 10-digit mobile number, the one you used at check-in.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onVerify(digits);
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr.status === 0 ? 'No connection. Check your internet and try again.' : apiErr.message);
      setBusy(false);
    }
  };

  return (
    <div className="pb-4">
      <Header title={`Is this you, ${member?.name.split(' ')[0] ?? ''}?`}
        text="Enter the mobile number you used at check-in. Only members of this team can submit for it." />

      <div className="checkin-glass checkin-enter mt-5 p-4 text-left" style={{ '--i': 1 } as React.CSSProperties}>
        <p className="text-[13px] font-semibold text-[var(--checkin-muted)]">You’re submitting for the whole team</p>
        <p className="mt-0.5 text-[17px] font-extrabold">{info.team.name} · {info.team.room}</p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {info.members.map((m) => (
            <li key={m.id} className={`rounded-full px-2.5 py-1 text-[13px] font-bold ${m.id === memberId
              ? 'bg-[var(--checkin-maroon)] text-white' : 'bg-white/90 ring-1 ring-[var(--checkin-line)]'}`}>
              {m.name}{m.id === memberId ? ' (you)' : ''}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={submit} noValidate className="checkin-enter mt-5" style={{ '--i': 2 } as React.CSSProperties}>
        <CheckinField label="Your mobile number" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14}
          placeholder="98765 43210" value={phone} enterKeyHint="go" autoFocus={!initialPhone}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPhone(e.target.value); setError(null); }}
          error={error ?? undefined} hint={error ? undefined : 'The same number you entered when you got your seat.'} />
        <div className="mt-5 space-y-2 text-center">
          <CheckinButton type="submit" loading={busy} loadingLabel="Checking">Yes, it’s me · Continue</CheckinButton>
          <button type="button" onClick={onBack} disabled={busy} className="checkin-link px-2 py-2 text-sm">Not you? Choose another name</button>
        </div>
      </form>
    </div>
  );
}

/** The "one chance" rule, shown before a team starts and again on the form. */
function OneChance({ className = '' }: { className?: string }) {
  return (
    <div className={`checkin-enter rounded-2xl bg-amber-50 px-4 py-3.5 text-left ring-1 ring-amber-300 ${className}`}>
      <p className="text-[15px] font-extrabold text-amber-900">⚠ One chance only</p>
      <p className="mt-1 text-sm leading-relaxed text-amber-900">
        Each team can submit <b>once</b>. After you submit, it can’t be changed. Decide together, then let one person submit for the team.
      </p>
    </div>
  );
}

function TeamStep({ info, onPick, onNotMine }: { info: TeamInfo; onPick: (memberId: number) => void; onNotMine: () => void }) {
  const open = info.roomStatus === 'open';
  if (info.submission) {
    // Already submitted: show it, with no way to submit again.
    return (
      <div className="pb-4">
        <SubmittedHero info={info} title="Already submitted" />
        <p className="checkin-enter mx-auto mt-4 max-w-[32ch] text-center text-[15px] font-semibold leading-relaxed">
          Your team’s project is in. Each team submits once, so there’s nothing more to do. Good luck!
        </p>
        <SubmissionCard submission={info.submission} title="Your team’s submission" />
        <div className="mt-3 text-center">
          <button type="button" onClick={onNotMine} className="checkin-link px-2 py-2 text-sm">Not my team</button>
        </div>
      </div>
    );
  }
  return (
    <div className="pb-4">
      <Header title={`${info.team.name} · ${info.team.room}`}
        text={open ? 'Is this your team? Tap your own name. You’ll confirm it with your mobile number.' : undefined} />
      {open ? <Deadline deadline={info.deadline} /> : <CheckinNotice>{closedText(info.roomStatus)}</CheckinNotice>}
      {open && <OneChance className="mt-4" />}

      <div className="checkin-glass checkin-enter mt-4 p-4" style={{ '--i': 1 } as React.CSSProperties}>
        <h2 className="px-1 text-sm font-extrabold">{open ? 'Who’s submitting?' : 'Team members'}</h2>
        <div className="mt-3 space-y-2">
          {info.members.map((m) => (
            <button key={m.id} type="button" disabled={!open} onClick={() => onPick(m.id)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 text-left ring-1 ring-[var(--checkin-line)] transition-transform enabled:active:scale-[0.98] disabled:cursor-default">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--checkin-blush)] text-sm font-extrabold text-[var(--checkin-maroon)]">
                {info.team.teamNumber}{m.seat}
              </span>
              <span className="flex-1 text-[16px] font-bold">{m.name}</span>
              {open && <span aria-hidden className="text-lg text-[var(--checkin-maroon)]">→</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 text-center">
        <button type="button" onClick={onNotMine} className="checkin-link px-2 py-2 text-sm">Not my team</button>
      </div>
    </div>
  );
}

function SubmissionCard({ submission, title }: { submission: Submission; title: string }) {
  return (
    <div className="checkin-glass checkin-enter mt-5 p-5 text-left">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold">{title}</h2>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
          ✓ {submission.isLate ? 'Submitted late' : 'Submitted'}
        </span>
      </div>
      <p className="mt-3 text-lg font-extrabold leading-snug">{submission.projectName}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--checkin-maroon)]">{submission.theme}</p>
      <p className="mt-2 text-sm leading-relaxed text-[var(--checkin-muted)]">{submission.problemStatement}</p>
      <a href={submission.projectUrl} target="_blank" rel="noopener noreferrer"
        className="mt-3 block break-all rounded-xl bg-white/90 px-3 py-2 font-mono text-sm text-[var(--checkin-ink)] ring-1 ring-[var(--checkin-line)]">
        {submission.projectUrl}
      </a>
      <p className="mt-2 text-xs text-[var(--checkin-muted)]">
        {submission.submittedBy ? `By ${submission.submittedBy} · ` : ''}{clock(submission.updatedAt)}
      </p>
    </div>
  );
}

function TextArea({ label, value, onChange, error, hint, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; maxLength: number;
}) {
  const id = useId();
  return (
    <div className="text-left">
      <label htmlFor={id} className="mb-1.5 block pl-1 text-[13px] font-bold text-[var(--checkin-ink)]">{label}</label>
      <div className="checkin-field" data-invalid={Boolean(error) || undefined}>
        <textarea id={id} rows={4} value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error) || undefined} aria-describedby={`${id}-msg`}
          className="resize-none px-4 py-3 text-[16px] font-semibold leading-relaxed" />
      </div>
      <p id={`${id}-msg`} className={`mt-1.5 pl-1 text-[13px] ${error ? 'font-semibold text-[var(--checkin-maroon)]' : 'text-[var(--checkin-muted)]'}`}>{error ?? hint}</p>
    </div>
  );
}

const CHECKS = [
  'We opened the link and it shows our published app (not the Lovable editor).',
  'The project name, theme and problem are correct.',
  'Our whole team agrees this is our final submission.',
];

/**
 * Two steps on one screen: fill in the details, then review everything and tick the final checks.
 * The answers stay in place when going back from the review, or when the link check fails.
 */
function FormStep({ info, memberId, onBack, onSubmit, onAlreadySubmitted }: {
  info: TeamInfo;
  memberId: number;
  onBack: () => void;
  onSubmit: (form: Form) => Promise<void>;
  onAlreadySubmitted: () => void;
}) {
  const [form, setForm] = useState<Form>({ projectName: '', theme: '', problemStatement: '', projectUrl: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [busy, setBusy] = useState(false);
  const member = info.members.find((m) => m.id === memberId);
  const set = (key: keyof Form) => (value: string) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };
  const url = form.projectUrl.trim();
  const linkHref = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    const found: typeof errors = {};
    if (form.projectName.trim().length < 2) found.projectName = 'Enter your project’s name.';
    if (!form.theme) found.theme = 'Choose a theme.';
    if (form.problemStatement.trim().length < 15) found.problemStatement = 'Describe the problem in a sentence or two.';
    if (!url) found.projectUrl = 'Paste your published project link.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setServerError(null);
    setChecked(CHECKS.map(() => false));
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (busy || !checked.every(Boolean)) return;
    setBusy(true);
    setServerError(null);
    try {
      await onSubmit({ ...form, projectName: form.projectName.trim(), problemStatement: form.problemStatement.trim(), projectUrl: url });
    } catch (err) {
      const apiErr = err as ApiError;
      setBusy(false);
      if (apiErr.code === 'ALREADY_SUBMITTED') return onAlreadySubmitted();
      if (apiErr.code === 'INVALID_PROJECT_LINK') {
        // Back to the form with the link highlighted; nothing was saved.
        setReviewing(false);
        setErrors({ projectUrl: apiErr.message });
        return;
      }
      setServerError(apiErr.status === 0 ? 'No connection. Nothing was submitted yet, so you can try again.' : apiErr.message);
    }
  };

  if (reviewing) {
    const rows: [string, string][] = [
      ['Team', `${info.team.name} · ${info.team.room}`],
      ['Submitted by', member?.name ?? ''],
      ['Project name', form.projectName.trim()],
      ['Theme', form.theme],
      ['Problem', form.problemStatement.trim()],
    ];
    return (
      <div className="pb-4">
        <Header title="Check before you submit" text="This is final. Once you submit, your team can’t change it." />
        <Deadline deadline={info.deadline} />
        <div className="checkin-glass checkin-enter mt-4 p-5" style={{ '--i': 1 } as React.CSSProperties}>
          <dl className="divide-y divide-[var(--checkin-line)]">
            {rows.map(([label, value]) => (
              <div key={label} className="py-3 first:pt-0">
                <dt className="text-[13px] font-semibold text-[var(--checkin-muted)]">{label}</dt>
                <dd className="mt-0.5 break-words text-[16px] font-bold leading-snug">{value}</dd>
              </div>
            ))}
            <div className="pt-3">
              <dt className="text-[13px] font-semibold text-[var(--checkin-muted)]">Project link</dt>
              <dd className="mt-1 break-all font-mono text-[15px] font-semibold">{url}</dd>
              <a href={linkHref} target="_blank" rel="noopener noreferrer" className="checkin-ghost mt-3 min-h-12 gap-2 text-[15px]">
                Open the link to check it <span aria-hidden>↗</span>
              </a>
            </div>
          </dl>
        </div>

        <fieldset className="checkin-enter mt-4 space-y-2" style={{ '--i': 2 } as React.CSSProperties}>
          <legend className="mb-2 pl-1 text-[15px] font-extrabold">Tick all three to submit</legend>
          {CHECKS.map((text, i) => (
            <label key={text} className={`flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3.5 ring-1 transition-colors ${checked[i]
              ? 'bg-emerald-50 ring-emerald-400' : 'bg-white/85 ring-[var(--checkin-line)]'}`}>
              <input type="checkbox" checked={checked[i]} disabled={busy}
                onChange={(e) => setChecked(checked.map((c, j) => (j === i ? e.target.checked : c)))}
                className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-600" />
              <span className="text-[15px] font-semibold leading-snug">{text}</span>
            </label>
          ))}
        </fieldset>

        {serverError && <CheckinNotice>{serverError}</CheckinNotice>}
        <div className="mt-5 space-y-2 text-center">
          <CheckinButton type="button" onClick={submit} loading={busy} loadingLabel="Submitting your project"
            disabled={!checked.every(Boolean)} className="disabled:opacity-50">
            Submit — final
          </CheckinButton>
          <button type="button" onClick={() => setReviewing(false)} disabled={busy} className="checkin-link px-2 py-2 text-sm">
            Go back and edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <Header title="Submit your project" text={`${info.team.name} · ${info.team.room}${member ? ` · submitting as ${member.name}` : ''}`} />
      <Deadline deadline={info.deadline} />
      <OneChance className="mt-4" />
      <form onSubmit={review} noValidate className="checkin-glass checkin-enter mt-4 space-y-5 p-5" style={{ '--i': 1 } as React.CSSProperties}>
        <CheckinField label="1. Project name" value={form.projectName} maxLength={80} error={errors.projectName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('projectName')(e.target.value)} autoCapitalize="words" enterKeyHint="next" />

        <fieldset className="text-left">
          <legend className="mb-1.5 block pl-1 text-[13px] font-bold text-[var(--checkin-ink)]">2. Theme</legend>
          <div className="space-y-2">
            {info.themes.map((theme) => (
              <label key={theme} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 transition-colors ${form.theme === theme
                ? 'bg-[var(--checkin-blush)] ring-2 ring-[var(--checkin-maroon)]' : 'bg-white/85 ring-1 ring-[var(--checkin-line)]'}`}>
                <input type="radio" name="theme" value={theme} checked={form.theme === theme} onChange={() => set('theme')(theme)}
                  className="h-5 w-5 shrink-0 accent-[var(--checkin-maroon)]" />
                <span className="text-[16px] font-bold">{theme}</span>
              </label>
            ))}
          </div>
          {errors.theme && <p className="mt-1.5 pl-1 text-[13px] font-semibold text-[var(--checkin-maroon)]">{errors.theme}</p>}
        </fieldset>

        <TextArea label="3. What problem does it solve?" value={form.problemStatement} onChange={set('problemStatement')} maxLength={600}
          error={errors.problemStatement} hint="Who has this problem, and how does your app help them?" />

        <CheckinField label="4. Published project link" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="your-app.lovable.app" value={form.projectUrl} maxLength={500} error={errors.projectUrl}
          hint="In Lovable, click Publish and copy the link that ends in .lovable.app. Not the editor link."
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('projectUrl')(e.target.value)} enterKeyHint="done" />

        <div className="pt-1">
          <CheckinButton type="submit">Review before submitting</CheckinButton>
          <p className="mt-2 text-center text-xs text-[var(--checkin-muted)]">Nothing is sent yet. You’ll check everything on the next screen.</p>
        </div>
      </form>
      <div className="mt-3 text-center">
        <button type="button" onClick={onBack} className="checkin-link px-2 py-2 text-sm">Back</button>
      </div>
    </div>
  );
}

/** The big green card: an instructor walking past can see at a glance that the team has submitted. */
function SubmittedHero({ info, title }: { info: TeamInfo; title: string }) {
  return (
    <div className="checkin-enter mt-2 overflow-hidden rounded-[28px] bg-gradient-to-b from-emerald-600 to-emerald-700 px-6 py-8 text-center text-white shadow-[0_20px_44px_-20px_rgb(4_120_87/0.7)]">
      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white text-5xl font-black text-emerald-700 animate-seat-pop" aria-hidden>✓</div>
      <p className="mt-5 text-sm font-extrabold uppercase tracking-[0.2em] text-emerald-100">{title}</p>
      <h1 className="mt-2 text-[clamp(2.75rem,15vw,4rem)] font-black leading-none tracking-tight">{info.team.name}</h1>
      <p className="mt-2 text-xl font-bold text-emerald-50">{info.team.room}</p>
      {info.submission && <p className="mt-4 break-words text-lg font-extrabold">“{info.submission.projectName}”</p>}
      {info.submission && (
        <p className="mt-1 text-sm font-semibold text-emerald-100">
          at {clock(info.submission.updatedAt)}{info.submission.isLate ? ' · marked late' : ''}
        </p>
      )}
    </div>
  );
}

function DoneStep({ info }: { info: TeamInfo }) {
  return (
    <div className="pb-4">
      <SubmittedHero info={info} title="Project submitted" />
      <p className="checkin-enter mx-auto mt-4 max-w-[32ch] text-center text-[15px] font-semibold leading-relaxed" style={{ '--i': 1 } as React.CSSProperties}>
        Show this screen to your instructor. This is your team’s final submission. The judges will review it, and the winners are announced in your room.
      </p>
      {info.submission && <SubmissionCard submission={info.submission} title="What we received" />}
    </div>
  );
}
