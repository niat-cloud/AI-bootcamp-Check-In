import { useEffect, useState } from 'react';
import { api, getAdminToken, type ApiError } from '../../../lib/api';
import { AWARDS, clock, flagsOf, type Project } from './types';

/** One project in full: what the AI saw and why it scored it, plus the admin's override, note and disqualify. */
export function ProjectDrawer({ eventId, project, teamName, maxTotal, locked, onClose, onChanged }: {
  eventId: number;
  project: Project;
  teamName: string;
  maxTotal: number;
  locked: boolean;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [score, setScore] = useState(project.adminScore?.toString() ?? '');
  const [note, setNote] = useState(project.adminNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ev = project.evaluation;
  const award = AWARDS.find((a) => a.key === project.award);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged(message);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const saveReview = () => {
    const trimmed = score.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > maxTotal)) {
      setError(`The score must be between 0 and ${maxTotal}, or empty to use the AI score.`);
      return;
    }
    if (value !== null && !note.trim()) {
      setError('Add a note saying why you changed the score.');
      return;
    }
    act(() => api(`/events/${eventId}/projects/${project.id}`, { method: 'PATCH', body: { adminScore: value, adminNote: note.trim() || null } }),
      'Review saved');
  };

  const token = getAdminToken();
  const screenshot = ev?.hasScreenshot && token
    ? `/api/events/${eventId}/projects/${project.id}/screenshot?token=${encodeURIComponent(token)}&v=${encodeURIComponent(ev.createdAt)}`
    : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={`${teamName}: ${project.projectName}`}
        className="sheet-up h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-niat-line bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-niat-muted">
              {teamName}{project.rank ? ` · Rank ${project.rank}` : ''}
            </div>
            <h2 className="truncate text-xl font-extrabold">{project.projectName}</h2>
            <div className="text-sm font-semibold text-niat-maroon">{project.theme}</div>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm" aria-label="Close">✕</button>
        </div>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-1.5">
            {award && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${award.tone}`}>{award.short}</span>}
            {project.disqualified && <span className="rounded-full bg-niat-maroon px-2.5 py-0.5 text-xs font-bold text-white">Disqualified</span>}
            {flagsOf(project).map((f) => (
              <span key={f.text} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${f.tone === 'warn'
                ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-stone-100 text-niat-muted ring-stone-200'}`}>{f.text}</span>
            ))}
          </div>

          <a href={project.projectUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 rounded-xl border border-niat-line bg-niat-warm-white px-3 py-2 text-sm hover:border-niat-maroon/40">
            <span className="truncate font-mono">{project.projectUrl}</span>
            <span className="shrink-0 font-bold text-niat-maroon">Open ↗</span>
          </a>

          {screenshot && (
            <img src={screenshot} alt={`Screenshot of ${project.projectName}`} loading="lazy"
              className="w-full rounded-xl border border-niat-line" />
          )}

          <section>
            <h3 className="text-sm font-bold text-niat-muted">Problem (from the team)</h3>
            <p className="mt-1 text-sm leading-relaxed">{project.problemStatement}</p>
            <p className="mt-2 text-xs text-niat-muted">
              {project.members.join(', ')}
              {project.submittedBy && ` · submitted by ${project.submittedBy}`} · {clock(project.updatedAt)}
            </p>
          </section>

          <section className="rounded-2xl border border-niat-line p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-bold">AI evaluation</h3>
              <span className="text-2xl font-extrabold tabular-nums">
                {ev?.total ?? '—'}<span className="text-sm font-semibold text-niat-muted">/{ev?.maxTotal ?? maxTotal}</span>
              </span>
            </div>
            {!ev && (
              <p className="mt-2 text-sm text-niat-muted">
                {project.evalStatus === 'failed' ? `Scoring failed: ${project.lastError ?? 'unknown error'}` : 'Waiting to be scored…'}
              </p>
            )}
            {ev && (
              <>
                {ev.summary && <p className="mt-2 text-sm leading-relaxed">{ev.summary}</p>}
                <ul className="mt-4 space-y-3">
                  {ev.criteria.map((c) => (
                    <li key={c.key}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold">{c.label}</span>
                        <span className="font-bold tabular-nums">{c.score}/{c.max}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                        <div className="h-full rounded-full bg-niat-maroon" style={{ width: `${(c.score / c.max) * 100}%` }} />
                      </div>
                      {c.reason && <p className="mt-1 text-xs leading-relaxed text-niat-muted">{c.reason}</p>}
                    </li>
                  ))}
                </ul>
                {(ev.strengths || ev.improvements) && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {ev.strengths && <div className="rounded-xl bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900"><b>Strengths.</b> {ev.strengths}</div>}
                    {ev.improvements && <div className="rounded-xl bg-niat-cream/60 p-3 text-xs leading-relaxed"><b>To improve.</b> {ev.improvements}</div>}
                  </div>
                )}
                <p className="mt-3 text-xs text-niat-muted">Scored {clock(ev.createdAt)}{ev.model ? ` by ${ev.model}` : ''}</p>
              </>
            )}
            {!locked && (
              <button type="button" disabled={busy || project.evalStatus === 'pending' || project.evalStatus === 'evaluating'}
                onClick={() => act(() => api(`/events/${eventId}/projects/${project.id}/re-evaluate`, { method: 'POST' }), 'Sent back for AI scoring')}
                className="btn-secondary mt-3 py-1.5 text-sm">
                {project.evalStatus === 'pending' || project.evalStatus === 'evaluating' ? 'Scoring…' : 'Score again'}
              </button>
            )}
          </section>

          <section className="rounded-2xl border border-niat-line p-4">
            <h3 className="font-bold">Judge’s review</h3>
            <p className="mt-1 text-xs text-niat-muted">
              A judge’s score replaces the AI score in the ranking. Leave it empty to keep the AI score.
              {project.reviewedBy && ` Last change by ${project.reviewedBy}.`}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
              <div>
                <label className="label" htmlFor="admin-score">Score (/{maxTotal})</label>
                <input id="admin-score" className="input" inputMode="decimal" value={score} disabled={locked}
                  onChange={(e) => setScore(e.target.value)} placeholder={ev?.total?.toString() ?? ''} />
              </div>
              <div>
                <label className="label" htmlFor="admin-note">Note</label>
                <input id="admin-note" className="input" value={note} disabled={locked} maxLength={500}
                  onChange={(e) => setNote(e.target.value)} placeholder="Why the score changed, what you saw in the demo…" />
              </div>
            </div>
            {error && <p role="alert" className="mt-2 text-sm font-semibold text-niat-maroon">{error}</p>}
            {locked ? (
              <p className="mt-3 text-sm text-niat-muted">This room’s results are locked.</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn-primary py-2 text-sm" disabled={busy} onClick={saveReview}>Save review</button>
                <button type="button" className="btn-secondary py-2 text-sm" disabled={busy}
                  onClick={() => act(() => api(`/events/${eventId}/projects/${project.id}`, { method: 'PATCH', body: { disqualified: !project.disqualified } }),
                    project.disqualified ? 'Project reinstated' : 'Project disqualified')}>
                  {project.disqualified ? 'Reinstate' : 'Disqualify'}
                </button>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
