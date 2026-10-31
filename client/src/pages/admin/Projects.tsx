import { useCallback, useEffect, useRef, useState } from 'react';
import { api, downloadFile, publicUrl, type ApiError } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';
import { Announce } from './projects/Announce';
import { Leaderboard } from './projects/Leaderboard';
import { Present } from './projects/Present';
import { ProjectDrawer } from './projects/ProjectDrawer';
import { RoomBoard } from './projects/RoomBoard';
import { AWARDS, clock, SHORTLIST_SIZE, STATUS_LABEL, type Award, type ProjectRoom, type ProjectsOverview } from './projects/types';

/**
 * Projects scored at the same time by this page. The server hands each request a different project.
 * Kept at 2 so two locations sharing one free-tier AI key stay under its per-minute limit.
 */
const SCORING_PARALLEL = 2;

/** Projects & judging: open/close submissions per room, watch who's missing, review the AI ranking, pick winners. */
export default function Projects() {
  const { event } = useAdmin();
  const [data, setData] = useState<ProjectsOverview | null>(null);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [toast, setToast] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [autoScore, setAutoScore] = useState(true);
  const scoring = useRef(0);

  const load = useCallback(async () => {
    if (!event) return;
    try {
      setData(await api<ProjectsOverview>(`/events/${event.id}/projects`));
    } catch (err) {
      setToast({ tone: 'error', text: (err as ApiError).message });
    }
  }, [event]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // While this page is open, it works through the AI queue, up to SCORING_PARALLEL projects at a time.
  useEffect(() => {
    if (!event || !data?.aiConfigured || !autoScore) return;
    const start = Math.min(SCORING_PARALLEL - scoring.current, data.queue.pending);
    for (let i = 0; i < start; i++) {
      scoring.current += 1;
      api<{ processed: number | null }>(`/events/${event.id}/projects/evaluate-next`, { method: 'POST' })
        .catch((err) => setToast({ tone: 'error', text: (err as ApiError).message }))
        .finally(() => { scoring.current -= 1; load(); });
    }
  }, [event, data, autoScore, load]);

  if (!event) return <NoEvent />;
  if (!data) return <div className="p-8 text-center text-niat-muted">Loading projects…</div>;

  const room = data.rooms.find((r) => r.id === roomId) ?? data.rooms[0];
  const submitPath = event.publicPath ? `${event.publicPath}/project` : null;
  const run = async (work: () => Promise<unknown>, text: string) => {
    try { await work(); setToast({ tone: 'ok', text }); } catch (err) { setToast({ tone: 'error', text: (err as ApiError).message }); }
    await load();
  };
  const setStatus = (id: number | 'all', status: string, deadlineMinutes?: number | null) =>
    run(() => api(`/events/${event.id}/projects/rooms/${id}/status`, { body: { status, deadlineMinutes } }), 'Submissions updated');

  const totals = data.rooms.reduce((t, r) => ({ teams: t.teams + r.teamCount, submitted: t.submitted + r.submittedCount, scored: t.scored + r.evaluatedCount }), { teams: 0, submitted: 0, scored: 0 });
  const open = room?.projects.find((p) => p.id === openId);

  return (
    <div>
      <PageHeader title="Projects" subtitle="Team submissions, AI scores and each room's winners"
        actions={<>
          <button className="btn-secondary py-2 text-sm" onClick={() => setStatus('all', 'open')}>Open all rooms</button>
          <button className="btn-secondary py-2 text-sm" onClick={() => downloadFile(`/events/${event.id}/projects/export`, 'projects.csv').catch((e) => setToast({ tone: 'error', text: e.message }))}>Export CSV</button>
        </>} />

      {toast && (
        <div role="status" className={`mb-4 flex justify-between rounded-xl px-4 py-3 text-sm font-medium ${toast.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-niat-pink text-niat-maroon-dark'}`}>
          <span>{toast.tone === 'ok' ? '✓ ' : '⚠ '}{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
      {!data.aiConfigured && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">AI scoring is off: set <code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> on the server. Submissions are still collected.</div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Teams submitted', `${totals.submitted}/${totals.teams}`], ['AI scored', totals.scored], ['Waiting for AI', data.queue.pending + data.queue.evaluating], ['Scoring failed', data.queue.failed]].map(([label, value]) => (
          <div key={label} className="card py-3"><div className="text-xs font-semibold text-niat-muted">{label}</div><div className="text-2xl font-extrabold tabular-nums">{value}</div></div>
        ))}
      </div>
      {data.aiConfigured && <ScoringProgress scored={totals.scored} submitted={totals.submitted} data={data} autoScore={autoScore} setAutoScore={setAutoScore} />}

      <RoomBoard rooms={data.rooms} selectedId={room?.id} onSelect={setRoomId}
        onStatus={(id, status, deadlineMinutes) => setStatus(id, status, deadlineMinutes)} />

      {room && <RoomPanel key={room.id} room={room} data={data} eventId={event.id} prefix={data.teamNamePrefix}
        canPresent={Boolean(submitPath)} onPresent={() => setPresenting(true)} onAnnounce={() => setAnnouncing(true)}
        onOpen={setOpenId} setStatus={setStatus} run={run} />}

      {open && room && (
        <ProjectDrawer eventId={event.id} project={open} teamName={`${room.name} · ${data.teamNamePrefix} ${open.teamNumber}`}
          maxTotal={data.rubric.maxTotal} locked={Boolean(room.resultsLockedAt)} onClose={() => setOpenId(null)}
          onChanged={async (text) => { setToast({ tone: 'ok', text }); await load(); }} />
      )}
      {presenting && room && submitPath && (
        <Present room={room} url={publicUrl(`${submitPath}?room=${room.id}`)} onClose={() => setPresenting(false)} />
      )}
      {announcing && room && <Announce room={room} prefix={data.teamNamePrefix} onClose={() => setAnnouncing(false)} />}
    </div>
  );
}

/** How far the AI has got, and a reminder that scoring only runs while an admin keeps this page open. */
function ScoringProgress({ scored, submitted, data, autoScore, setAutoScore }: {
  scored: number; submitted: number; data: ProjectsOverview; autoScore: boolean; setAutoScore: (on: boolean) => void;
}) {
  const waiting = data.queue.pending + data.queue.evaluating;
  const limited = data.rooms.some((r) => r.projects.some((p) => p.retryAt));
  return (
    <div className="card mb-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-bold">
          {submitted ? `${scored} of ${submitted} projects scored` : 'No projects submitted yet'}
          {waiting > 0 && <span className="font-semibold text-niat-muted"> · {waiting} waiting</span>}
          {data.queue.failed > 0 && <span className="font-semibold text-niat-maroon"> · {data.queue.failed} failed</span>}
        </span>
        <label className="flex items-center gap-2 text-niat-muted">
          <input type="checkbox" checked={autoScore} onChange={(e) => setAutoScore(e.target.checked)} /> Score automatically
        </label>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-niat-maroon transition-[width] duration-700" style={{ width: `${submitted ? (scored / submitted) * 100 : 0}%` }} />
      </div>
      <p className={`mt-2 text-xs ${limited ? 'font-semibold text-amber-800' : 'text-niat-muted'}`}>
        {limited
          ? 'The AI usage limit was reached. Waiting projects are retried automatically in about a minute.'
          : waiting > 0 && autoScore
            ? 'Scoring runs while this page is open. Keep this tab open until every project is scored.'
            : !autoScore ? 'Automatic scoring is paused on this page.' : 'Every submitted project is scored.'}
      </p>
    </div>
  );
}

function RoomPanel({ room, data, eventId, prefix, canPresent, onPresent, onAnnounce, onOpen, setStatus, run }: {
  room: ProjectRoom; data: ProjectsOverview; eventId: number; prefix: string; canPresent: boolean;
  onPresent: () => void; onAnnounce: () => void; onOpen: (id: number) => void;
  setStatus: (id: number, status: string, deadlineMinutes?: number | null) => Promise<void>;
  run: (work: () => Promise<unknown>, text: string) => Promise<void>;
}) {
  const locked = Boolean(room.resultsLockedAt);
  const [minutes, setMinutes] = useState('30');
  const [awards, setAwards] = useState<Record<Award, number | null>>(() => {
    const a = { winner: null, runner_up: null, second_runner_up: null } as Record<Award, number | null>;
    for (const p of room.projects) if (p.award) a[p.award] = p.id;
    return a;
  });
  const ranked = room.projects.filter((p) => p.rank !== null);
  const fillTop3 = () => setAwards({ winner: ranked[0]?.id ?? null, runner_up: ranked[1]?.id ?? null, second_runner_up: ranked[2]?.id ?? null });

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="font-bold">{room.name}: submissions {STATUS_LABEL[room.status].toLowerCase()}</div>
          <div className="text-sm text-niat-muted">
            {room.submittedCount}/{room.teamCount} teams · {room.lateCount} late
            {room.deadline && ` · deadline ${clock(room.deadline)}${room.deadlinePassed ? ' (passed)' : ''}`}
            {locked && ' · results locked'}
          </div>
        </div>
        {canPresent && <button className="btn-secondary py-2 text-sm" onClick={onPresent}>Show QR on screen</button>}
        {!locked && room.status !== 'open' && (
          <span className="flex items-center gap-2">
            <select className="input w-auto py-1.5 text-sm" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Deadline">
              <option value="">No deadline</option>{[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
            <button className="btn-primary py-2 text-sm" onClick={() => setStatus(room.id, 'open', minutes ? Number(minutes) : null)}>Open submissions</button>
          </span>
        )}
        {!locked && room.status === 'open' && (
          <>
            <button className="btn-secondary py-2 text-sm" onClick={() => setStatus(room.id, 'open',
              Math.max(10, Math.ceil(((room.deadline ? new Date(room.deadline).getTime() : Date.now()) - Date.now()) / 60_000) + 10))}>+10 min</button>
            <button className="btn-danger py-2 text-sm" onClick={() => setStatus(room.id, 'closed')}>Close submissions</button>
          </>
        )}
      </div>

      {room.missing.length > 0 && (
        <div className="card">
          <h3 className="font-bold">Not submitted yet ({room.missing.length})</h3>
          <p className="text-sm text-niat-muted">Ask these teams to submit.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {room.missing.map((t) => (
              <span key={t.teamId} className="rounded-xl bg-niat-pink px-3 py-1.5 text-sm" title={t.members.join(', ')}>
                <b>{prefix} {t.teamNumber}</b> <span className="text-niat-muted">{t.members.map((m) => m.split(' ')[0]).join(', ')}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <Leaderboard projects={room.projects} data={data} prefix={prefix} onOpen={onOpen} />

      <div className="card">
        <h3 className="font-bold">Winners for {room.name}</h3>
        <p className="text-sm text-niat-muted">The top {SHORTLIST_SIZE} are highlighted above. Review them, then choose the winners.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {AWARDS.map((a) => (
            <label key={a.key} className="text-sm"><span className="label">{a.label}</span>
              <select className="input" disabled={locked} value={awards[a.key] ?? ''} onChange={(e) => setAwards({ ...awards, [a.key]: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {ranked.map((p) => <option key={p.id} value={p.id}>#{p.rank} {prefix} {p.teamNumber} · {p.projectName}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!locked && <button className="btn-secondary py-2 text-sm" onClick={fillTop3}>Fill from top 3</button>}
          {!locked && <button className="btn-primary py-2 text-sm" onClick={() => run(() => api(`/events/${eventId}/projects/rooms/${room.id}/awards`, { body: awards }), 'Winners saved')}>Save winners</button>}
          <button className="btn-primary py-2 text-sm" disabled={!room.projects.some((p) => p.award)} onClick={onAnnounce}
            title={room.projects.some((p) => p.award) ? 'Reveal the winners on the projector' : 'Save the winners first'}>
            🏆 Announce winners
          </button>
          <button className="btn-secondary py-2 text-sm" onClick={() => run(() => api(`/events/${eventId}/projects/rooms/${room.id}/lock`, { body: { locked: !locked } }), locked ? 'Results unlocked' : 'Results locked')}>
            {locked ? 'Unlock results' : 'Lock results'}
          </button>
        </div>
      </div>
    </div>
  );
}
