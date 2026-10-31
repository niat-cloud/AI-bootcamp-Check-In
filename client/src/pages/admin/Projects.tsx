import { useCallback, useEffect, useRef, useState } from 'react';
import { api, downloadFile, publicUrl, type ApiError } from '../../lib/api';
import { NoEvent, PageHeader, useAdmin } from './AdminLayout';
import { Present } from './projects/Present';
import { ProjectDrawer } from './projects/ProjectDrawer';
import { AWARDS, clock, flagsOf, SHORTLIST_SIZE, STATUS_LABEL, type Award, type ProjectRoom, type ProjectsOverview } from './projects/types';

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
      {data.aiConfigured && (
        <label className="mb-4 flex items-center gap-2 text-sm text-niat-muted">
          <input type="checkbox" checked={autoScore} onChange={(e) => setAutoScore(e.target.checked)} /> Score new submissions automatically while this page is open
        </label>
      )}

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {data.rooms.map((r) => (
          <button key={r.id} onClick={() => setRoomId(r.id)} aria-pressed={r.id === room?.id}
            className={`shrink-0 rounded-xl border px-3.5 py-2 text-left text-sm ${r.id === room?.id ? 'border-niat-maroon bg-niat-maroon text-white' : 'border-niat-line bg-white'}`}>
            <b>{r.name}</b><span className="block text-xs opacity-80">{r.submittedCount}/{r.teamCount} · {STATUS_LABEL[r.status]}</span>
          </button>
        ))}
      </nav>

      {room && <RoomPanel key={room.id} room={room} data={data} eventId={event.id} prefix={data.teamNamePrefix}
        canPresent={Boolean(submitPath)} onPresent={() => setPresenting(true)} onOpen={setOpenId} setStatus={setStatus} run={run} />}

      {open && room && (
        <ProjectDrawer eventId={event.id} project={open} teamName={`${room.name} · ${data.teamNamePrefix} ${open.teamNumber}`}
          maxTotal={data.rubric.maxTotal} locked={Boolean(room.resultsLockedAt)} onClose={() => setOpenId(null)}
          onChanged={async (text) => { setToast({ tone: 'ok', text }); await load(); }} />
      )}
      {presenting && room && submitPath && (
        <Present room={room} url={publicUrl(`${submitPath}?room=${room.id}`)} onClose={() => setPresenting(false)} />
      )}
    </div>
  );
}

function RoomPanel({ room, data, eventId, prefix, canPresent, onPresent, onOpen, setStatus, run }: {
  room: ProjectRoom; data: ProjectsOverview; eventId: number; prefix: string; canPresent: boolean;
  onPresent: () => void; onOpen: (id: number) => void;
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

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-niat-warm-white text-left text-xs uppercase text-niat-muted">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Team / project</th><th className="px-3 py-2">Score</th>
              {data.rubric.criteria.map((c) => <th key={c.key} className="px-2 py-2" title={c.label}>{c.label.split(' ')[0]}</th>)}<th className="px-3 py-2">Flags</th></tr>
          </thead>
          <tbody>
            {room.projects.map((p) => (
              <tr key={p.id} onClick={() => onOpen(p.id)}
                className={`cursor-pointer border-t border-niat-line hover:bg-niat-cream/40 ${p.rank && p.rank <= SHORTLIST_SIZE ? 'bg-amber-50/40' : ''} ${p.disqualified ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2 font-bold">{p.rank ?? '–'}{p.tied && <span title="Tied score" className="text-amber-700">*</span>}</td>
                <td className="px-3 py-2"><b>{prefix} {p.teamNumber}</b> · {p.projectName}
                  {p.award && <span className="ml-1 text-xs font-bold">{AWARDS.find((a) => a.key === p.award)?.short}</span>}
                  <div className="text-xs text-niat-muted">{p.theme}</div></td>
                <td className="px-3 py-2 font-bold tabular-nums">
                  {p.finalScore ?? (p.evalStatus === 'failed' ? '⚠' : '…')}<span className="text-xs text-niat-muted">/{data.rubric.maxTotal}</span>
                  {p.adminScore !== null && <div className="text-xs font-normal text-niat-muted">judge (AI {p.evaluation?.total ?? '–'})</div>}
                </td>
                {data.rubric.criteria.map((c) => <td key={c.key} className="px-2 py-2 tabular-nums">{p.evaluation?.criteria.find((x) => x.key === c.key)?.score ?? '–'}</td>)}
                <td className="px-3 py-2 text-xs">{flagsOf(p).map((f) => f.text).join(' · ')}</td>
              </tr>
            ))}
            {!room.projects.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-niat-muted">No submissions yet.</td></tr>}
          </tbody>
        </table>
      </div>

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
          <button className="btn-secondary py-2 text-sm" onClick={() => run(() => api(`/events/${eventId}/projects/rooms/${room.id}/lock`, { body: { locked: !locked } }), locked ? 'Results unlocked' : 'Results locked')}>
            {locked ? 'Unlock results' : 'Lock results'}
          </button>
        </div>
      </div>
    </div>
  );
}
