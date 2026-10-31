import { AWARDS, flagsOf, SHORTLIST_SIZE, type Project, type ProjectsOverview } from './types';

/** Red / amber / green by share of the maximum, so strong and weak criteria stand out at a glance. */
const scoreTone = (score: number, max: number) => {
  const share = score / max;
  return share >= 0.7 ? 'bg-emerald-50 text-emerald-800' : share >= 0.5 ? 'bg-amber-50 text-amber-800' : 'bg-niat-pink text-niat-maroon';
};

/** What the AI is doing with this project right now. */
function ScoringStatus({ p }: { p: Project }) {
  if (p.evalStatus === 'evaluating') {
    return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-niat-muted"><span className="spin h-3 w-3 rounded-full border-2 border-niat-line border-t-niat-maroon" aria-hidden />Scoring now…</span>;
  }
  if (p.evalStatus === 'pending' && p.retryAt) {
    const secs = Math.max(0, Math.ceil((new Date(p.retryAt).getTime() - Date.now()) / 1000));
    return <span className="text-xs font-semibold text-amber-800">AI limit reached · retry in {secs > 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`}</span>;
  }
  if (p.evalStatus === 'pending') return <span className="text-xs font-semibold text-niat-muted">Waiting to score</span>;
  if (p.evalStatus === 'failed') return <span className="text-xs font-bold text-niat-maroon">Failed · open to score again</span>;
  return null;
}

/** The room's ranking: one row per project, top 5 above a "shortlist" line. Clicking a row opens its details. */
export function Leaderboard({ projects, data, prefix, onOpen }: {
  projects: Project[];
  data: ProjectsOverview;
  prefix: string;
  onOpen: (id: number) => void;
}) {
  const { criteria, maxTotal } = data.rubric;
  const columns = 6 + criteria.length;
  const lastShortlisted = projects.filter((p) => p.rank !== null && p.rank <= SHORTLIST_SIZE).at(-1)?.id;

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="bg-niat-warm-white text-left text-xs text-niat-muted">
          <tr>
            <th className="px-3 py-2.5 font-bold">Rank</th>
            <th className="px-3 py-2.5 font-bold">Team &amp; project</th>
            <th className="px-3 py-2.5 font-bold">Link</th>
            <th className="px-3 py-2.5 font-bold">Total /{maxTotal}</th>
            {criteria.map((c) => (
              <th key={c.key} className="w-24 px-2 py-2.5 font-bold leading-tight">{c.label}<span className="block font-normal">/{c.max}</span></th>
            ))}
            <th className="px-3 py-2.5 font-bold">Status</th>
            <th className="px-3 py-2.5 font-bold">Flags</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const shortlisted = p.rank !== null && p.rank <= SHORTLIST_SIZE;
            const award = AWARDS.find((a) => a.key === p.award);
            return [
              <tr key={p.id} onClick={() => onOpen(p.id)}
                className={`cursor-pointer border-t border-niat-line hover:bg-niat-cream/40 ${shortlisted ? 'bg-amber-50/40' : ''} ${p.disqualified ? 'opacity-50' : ''}`}>
                <td className="px-3 py-2.5 text-base font-extrabold tabular-nums">
                  {p.rank ?? '–'}{p.tied && <span title="Same total as another team; the higher Working App score ranks first" className="text-amber-700">*</span>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-bold">{prefix} {p.teamNumber} · {p.projectName}</div>
                  <div className="text-xs text-niat-muted">{p.theme}</div>
                  {award && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${award.tone}`}>{award.short}</span>}
                  {p.disqualified && <span className="mt-1 inline-block rounded-full bg-niat-maroon px-2 py-0.5 text-xs font-bold text-white">Disqualified</span>}
                </td>
                <td className="px-3 py-2.5">
                  <a href={p.projectUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-lg border border-niat-line px-2 py-1 text-xs font-semibold text-niat-maroon hover:border-niat-maroon/40 hover:bg-niat-pink"
                    title={p.projectUrl}>
                    <span className="truncate">{p.projectUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span><span aria-hidden>↗</span>
                  </a>
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  <span className="text-lg font-extrabold">{p.finalScore ?? '–'}</span>
                  {p.adminScore !== null && <div className="text-xs text-niat-muted">judge · AI {p.evaluation?.total ?? '–'}</div>}
                </td>
                {criteria.map((c) => {
                  const score = p.evaluation?.criteria.find((x) => x.key === c.key)?.score;
                  return (
                    <td key={c.key} className="px-2 py-2.5">
                      {score === undefined ? <span className="text-niat-muted">–</span>
                        : <span className={`inline-block min-w-8 rounded-md px-1.5 py-0.5 text-center font-bold tabular-nums ${scoreTone(score, c.max)}`}>{score}</span>}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5"><ScoringStatus p={p} /></td>
                <td className="px-3 py-2.5 text-xs">
                  {flagsOf(p).filter((f) => f.text !== 'AI scoring failed').map((f) => (
                    <span key={f.text} className={`mb-1 mr-1 inline-block rounded-full px-2 py-0.5 font-semibold ${f.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-stone-100 text-niat-muted'}`}>{f.text}</span>
                  ))}
                </td>
              </tr>,
              p.id === lastShortlisted && projects.at(-1)?.id !== p.id && (
                <tr key={`${p.id}-line`} aria-hidden>
                  <td colSpan={columns} className="border-t-2 border-dashed border-niat-gold bg-niat-cream/40 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800">
                    ▲ Top {SHORTLIST_SIZE} shortlist for the judges
                  </td>
                </tr>
              ),
            ];
          })}
          {!projects.length && <tr><td colSpan={columns} className="px-3 py-8 text-center text-niat-muted">No submissions yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
