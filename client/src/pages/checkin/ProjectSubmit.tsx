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
  | { kind: 'form'; info: TeamInfo; memberId: number }
  | { kind: 'done'; info: TeamInfo; updated: boolean };

// This phone remembers its team, so reopening the page goes straight back to it.
const teamKey = (path: string) => `aibootcamp.project.${path}`;
const recallTeam = (path: string): number | null => {
  try { return Number(localStorage.getItem(teamKey(path))) || null; } catch { return null; }
};
const rememberTeam = (path: string, teamId: number) => { try { localStorage.setItem(teamKey(path), String(teamId)); } catch { /* storage unavailable */ } };
const forgetTeam = (path: string) => { try { localStorage.removeItem(teamKey(path)); } catch { /* storage unavailable */ } };

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

/** "Submit by 4:30 PM · 12 min left", updated every 15 seconds. */
function Deadline({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const left = Math.ceil((new Date(deadline).getTime() - now) / 60_000);
  return (
    <div className={`mt-4 rounded-2xl px-4 py-3 text-center text-sm font-bold ring-1 ${left > 0
      ? 'bg-white/80 text-[var(--checkin-ink)] ring-[var(--checkin-line)]'
      : 'bg-[var(--checkin-blush)] text-[#7A0619] ring-[rgb(165_9_37/0.15)]'}`}>
      {left > 0
        ? <>Submit by {clock(deadline)} · {left} min left</>
        : <>The deadline ({clock(deadline)}) has passed. Submit now: late projects are marked late.</>}
    </div>
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
            onPick={(memberId) => setScreen({ kind: 'form', info: screen.info, memberId })} />
        </CheckinShell>
      );

    case 'form':
      return (
        <CheckinShell footer="help">
          <FormStep info={screen.info} memberId={screen.memberId}
            onBack={() => setScreen({ kind: 'team', info: screen.info })}
            onSubmit={async (form) => {
              const result = await atLeast(api<TeamInfo & { updated: boolean }>(`${base}/projects/teams/${screen.info.team.id}`, {
                body: { ...form, memberId: screen.memberId },
              }), 900);
              setScreen({ kind: 'done', info: result, updated: result.updated });
            }} />
        </CheckinShell>
      );

    case 'done':
      return (
        <CheckinShell footer="help">
          <DoneStep info={screen.info} updated={screen.updated}
            onEdit={() => openTeam(screen.info.team.id).catch(() => setScreen({ kind: 'team', info: screen.info }))} />
        </CheckinShell>
      );
  }
}

function TeamStep({ info, onPick, onNotMine }: { info: TeamInfo; onPick: (memberId: number) => void; onNotMine: () => void }) {
  const open = info.roomStatus === 'open';
  return (
    <div className="pb-4">
      <Header title={`${info.team.name} · ${info.team.room}`}
        text={open ? 'Is this your team? Tap your name to submit for the team.' : undefined} />
      {open ? <Deadline deadline={info.deadline} /> : <CheckinNotice>{closedText(info.roomStatus)}</CheckinNotice>}

      {info.submission && <SubmissionCard submission={info.submission} title="Your team’s submission" />}

      <div className="checkin-glass checkin-enter mt-5 p-4" style={{ '--i': 1 } as React.CSSProperties}>
        <h2 className="px-1 text-sm font-extrabold">{open ? (info.submission ? 'Who’s updating it?' : 'Who’s submitting?') : 'Team members'}</h2>
        <div className="mt-3 space-y-2">
          {info.members.map((m) => (
            <button key={m.id} type="button" disabled={!open} onClick={() => onPick(m.id)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white/90 px-4 py-3 text-left ring-1 ring-[var(--checkin-line)] transition-transform enabled:active:scale-[0.98] disabled:cursor-default">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--checkin-blush)] text-sm font-extrabold text-[var(--checkin-maroon)]">
                {info.team.teamNumber}{m.seat}
              </span>
              <span className="flex-1 font-bold">{m.name}</span>
              {open && <span aria-hidden className="text-[var(--checkin-maroon)]">→</span>}
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
        className="mt-3 block truncate rounded-xl bg-white/90 px-3 py-2 font-mono text-sm text-[var(--checkin-ink)] ring-1 ring-[var(--checkin-line)]">
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

function FormStep({ info, memberId, onBack, onSubmit }: {
  info: TeamInfo;
  memberId: number;
  onBack: () => void;
  onSubmit: (form: Form) => Promise<void>;
}) {
  const s = info.submission;
  const [form, setForm] = useState<Form>({
    projectName: s?.projectName ?? '', theme: s?.theme ?? '', problemStatement: s?.problemStatement ?? '', projectUrl: s?.projectUrl ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const member = info.members.find((m) => m.id === memberId);
  const set = (key: keyof Form) => (value: string) => {
    setForm({ ...form, [key]: value });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found: typeof errors = {};
    if (form.projectName.trim().length < 2) found.projectName = 'Enter your project’s name.';
    if (!form.theme) found.theme = 'Choose a theme.';
    if (form.problemStatement.trim().length < 15) found.problemStatement = 'Describe the problem in a sentence or two.';
    if (!form.projectUrl.trim()) found.projectUrl = 'Paste your published project link.';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setServerError(null);
    try {
      await onSubmit({ ...form, projectName: form.projectName.trim(), problemStatement: form.problemStatement.trim(), projectUrl: form.projectUrl.trim() });
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === 'INVALID_PROJECT_LINK') setErrors({ projectUrl: apiErr.message });
      else setServerError(apiErr.status === 0 ? 'No connection. Your answers are kept, so you can try again.' : apiErr.message);
      setBusy(false);
    }
  };

  return (
    <div className="pb-4">
      <Header title={s ? 'Update your project' : 'Submit your project'} text={`${info.team.name} · ${info.team.room}${member ? ` · submitting as ${member.name}` : ''}`} />
      <Deadline deadline={info.deadline} />
      <form onSubmit={submit} noValidate className="checkin-glass checkin-enter mt-5 space-y-4 p-5" style={{ '--i': 1 } as React.CSSProperties}>
        <CheckinField label="Project name" value={form.projectName} maxLength={80} error={errors.projectName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('projectName')(e.target.value)} autoCapitalize="words" enterKeyHint="next" />

        <fieldset className="text-left">
          <legend className="mb-1.5 block pl-1 text-[13px] font-bold text-[var(--checkin-ink)]">Theme</legend>
          <div className="space-y-2">
            {info.themes.map((theme) => (
              <label key={theme} className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 ring-1 transition-colors ${form.theme === theme
                ? 'bg-[var(--checkin-blush)] ring-[var(--checkin-maroon)]' : 'bg-white/85 ring-[var(--checkin-line)]'}`}>
                <input type="radio" name="theme" value={theme} checked={form.theme === theme} onChange={() => set('theme')(theme)}
                  className="h-4 w-4 accent-[var(--checkin-maroon)]" />
                <span className="text-[15px] font-bold">{theme}</span>
              </label>
            ))}
          </div>
          {errors.theme && <p className="mt-1.5 pl-1 text-[13px] font-semibold text-[var(--checkin-maroon)]">{errors.theme}</p>}
        </fieldset>

        <TextArea label="What problem does it solve?" value={form.problemStatement} onChange={set('problemStatement')} maxLength={600}
          error={errors.problemStatement} hint="Who has this problem, and how does your app help them?" />

        <CheckinField label="Published project link" type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="your-app.lovable.app" value={form.projectUrl} maxLength={500} error={errors.projectUrl}
          hint="In Lovable, click Publish and copy the link that ends in .lovable.app."
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('projectUrl')(e.target.value)} enterKeyHint="send" />

        {serverError && <CheckinNotice>{serverError}</CheckinNotice>}
        <div className="pt-2">
          <CheckinButton type="submit" loading={busy} loadingLabel="Checking your link">{s ? 'Update submission' : 'Submit project'}</CheckinButton>
        </div>
      </form>
      <div className="mt-3 text-center">
        <button type="button" onClick={onBack} disabled={busy} className="checkin-link px-2 py-2 text-sm">Back</button>
      </div>
    </div>
  );
}

function DoneStep({ info, updated, onEdit }: { info: TeamInfo; updated: boolean; onEdit: () => void }) {
  return (
    <div className="pb-4">
      <div className="checkin-enter text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-3xl text-emerald-700 ring-1 ring-emerald-200" aria-hidden>✓</div>
        <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-tight">{updated ? 'Submission updated' : 'Project submitted!'}</h1>
        <p className="mx-auto mt-1.5 max-w-[32ch] text-[15px] leading-relaxed text-[var(--checkin-muted)]">
          {info.team.name} · {info.team.room}. The judges will review it, and the winners are announced in your room.
        </p>
      </div>
      {info.submission && <SubmissionCard submission={info.submission} title="What we received" />}
      {info.roomStatus === 'open' && (
        <div className="mt-5 text-center">
          <button type="button" onClick={onEdit} className="checkin-ghost">Change something</button>
          <p className="mt-2 text-xs text-[var(--checkin-muted)]">You can update it until submissions close. The latest version is the one judged.</p>
        </div>
      )}
    </div>
  );
}
