import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { AiRateLimitError, aiConfigured, evaluateProject } from '../lib/evaluator.js';
import { normalizePhone } from '../lib/phone.js';
import { assertReachable, capturePage, normalizeProjectUrl } from '../lib/projectPage.js';
import { CRITERIA, MAX_TOTAL, PROJECT_THEMES, RUBRIC_VERSION } from '../lib/rubric.js';
import { logAllocation } from './rooms.js';

/**
 * Project submissions: one per team, per event. Students submit from the event's project page,
 * the AI scores each submission, and admins pick each room's winners from the ranking.
 */

export type ProjectsStatus = 'not_open' | 'open' | 'closed';

/** "Sai Kumar Reddy" → "Sai Kumar R." — enough for teammates to recognise themselves on a public page. */
export const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts.slice(0, -1).join(' ')} ${parts.at(-1)![0]!.toUpperCase()}.` : parts[0] ?? '';
};

/** Who is submitting: a member of the team, proven by the phone number they checked in with. */
export const memberInput = z.object({
  memberId: z.coerce.number().int().positive('Choose your name from the team list'),
  phone: z.string().trim().min(1, 'Enter your mobile number').max(20),
});

export const submissionInput = memberInput.extend({
  projectName: z.string().trim().min(2, 'Enter your project’s name').max(80),
  theme: z.enum(PROJECT_THEMES, { errorMap: () => ({ message: 'Choose your project’s theme' }) }),
  problemStatement: z.string().trim().min(15, 'Describe the problem in a sentence or two').max(600),
  projectUrl: z.string().trim().min(1, 'Paste your project link').max(500),
});
export type SubmissionInput = z.infer<typeof submissionInput>;

/** Teams that have at least one seated student: the teams expected to submit. */
const ACTIVE_TEAMS = `
  SELECT t.id, t.room_id, t.team_number FROM teams t
  WHERE t.event_id = $1 AND EXISTS (SELECT 1 FROM seats s WHERE s.team_id = t.id AND s.status = 'assigned')`;

// ---- Student side ----

export async function publicRooms(eventId: number, prefix: string) {
  const { rows } = await pool.query(
    `SELECT r.id AS room_id, r.name AS room, r.projects_status, r.projects_deadline,
       t.id AS team_id, t.team_number, ps.id IS NOT NULL AS submitted,
       (SELECT COUNT(*)::int FROM seats s WHERE s.team_id = t.id AND s.status = 'assigned') AS members
     FROM rooms r
     LEFT JOIN (${ACTIVE_TEAMS}) t ON t.room_id = r.id
     LEFT JOIN project_submissions ps ON ps.team_id = t.id
     WHERE r.event_id = $1 AND r.is_active
     ORDER BY r.priority, t.team_number`,
    [eventId],
  );
  const rooms = new Map<number, any>();
  for (const r of rows) {
    if (!rooms.has(r.room_id)) {
      rooms.set(r.room_id, { id: r.room_id, name: r.room, status: r.projects_status, deadline: r.projects_deadline, teams: [] });
    }
    if (r.team_id) {
      rooms.get(r.room_id).teams.push({
        id: r.team_id, teamNumber: r.team_number, name: `${prefix} ${r.team_number}`, members: r.members, submitted: r.submitted,
      });
    }
  }
  // Rooms without seated teams have nothing to submit.
  return [...rooms.values()].filter((room) => room.teams.length);
}

async function loadTeam(eventId: number, teamId: number) {
  const { rows: [team] } = await pool.query(
    `SELECT t.id, t.team_number, t.room_id, r.name AS room, r.projects_status, r.projects_deadline, e.team_name_prefix
     FROM teams t JOIN rooms r ON r.id = t.room_id JOIN events e ON e.id = t.event_id
     WHERE t.id = $1 AND t.event_id = $2`,
    [teamId, eventId],
  );
  if (!team) throw notFound('Team');
  const { rows: members } = await pool.query(
    `SELECT ep.id, p.name, p.phone, s.label FROM seats s
     JOIN event_participants ep ON ep.id = s.event_participant_id
     JOIN participants p ON p.id = ep.participant_id
     WHERE s.team_id = $1 ORDER BY s.position`,
    [teamId],
  );
  return { team, members };
}

export async function publicTeam(eventId: number, teamId: number) {
  const { team, members } = await loadTeam(eventId, teamId);
  const { rows: [sub] } = await pool.query(
    `SELECT ps.project_name, ps.theme, ps.problem_statement, ps.project_url, ps.submitted_at, ps.updated_at, ps.is_late,
       ps.submitted_by, p.name AS submitted_by_name
     FROM project_submissions ps
     LEFT JOIN event_participants ep ON ep.id = ps.submitted_by
     LEFT JOIN participants p ON p.id = ep.participant_id
     WHERE ps.team_id = $1`,
    [teamId],
  );
  return {
    team: { id: team.id, teamNumber: team.team_number, name: `${team.team_name_prefix} ${team.team_number}`, room: team.room },
    roomStatus: team.projects_status as ProjectsStatus,
    deadline: team.projects_deadline,
    members: members.map((m) => ({ id: m.id, name: shortName(m.name), seat: m.label })),
    submission: sub ? {
      projectName: sub.project_name,
      theme: sub.theme,
      problemStatement: sub.problem_statement,
      projectUrl: sub.project_url,
      submittedAt: sub.submitted_at,
      updatedAt: sub.updated_at,
      isLate: sub.is_late,
      submittedBy: sub.submitted_by_name ? shortName(sub.submitted_by_name) : null,
    } : null,
    themes: PROJECT_THEMES,
  };
}

const closedError = (status: ProjectsStatus) => new AppError(409, 'SUBMISSIONS_CLOSED',
  status === 'not_open'
    ? 'Project submissions haven’t opened for your room yet. Your instructor will tell you when to submit.'
    : 'Project submissions for your room are closed. Talk to your instructor.');

/**
 * The student who tapped a name must be that person: their number has to match the one they checked in
 * with. This stops someone from another team (or a teammate's friend) submitting a project for a team.
 */
export async function verifyMember(eventId: number, teamId: number, v: z.infer<typeof memberInput>) {
  const { members } = await loadTeam(eventId, teamId);
  const member = members.find((m) => m.id === v.memberId);
  if (!member) throw badRequest('Choose your name from your team’s list.');
  const phone = normalizePhone(v.phone);
  if (!phone) throw new AppError(400, 'INVALID_PHONE', 'Enter a valid 10-digit mobile number.');
  if (phone !== member.phone) {
    throw new AppError(403, 'PHONE_MISMATCH',
      `This isn’t the number ${shortName(member.name)} checked in with. Use your own name and the mobile number you gave at check-in.`);
  }
  return { ok: true, name: shortName(member.name) };
}

const alreadySubmittedError = () => new AppError(409, 'ALREADY_SUBMITTED',
  'Your team has already submitted its project. Each team gets one submission. If something is wrong, talk to your instructor.');

/**
 * Save the team's one and only submission. A team can't change it afterwards; if it was a genuine mistake,
 * an admin removes the submission (deleteSubmission) and the team submits again.
 */
export async function submitProject(eventId: number, teamId: number, v: SubmissionInput) {
  const { team, members } = await loadTeam(eventId, teamId);
  if (team.projects_status !== 'open') throw closedError(team.projects_status);
  const { rowCount: exists } = await pool.query('SELECT 1 FROM project_submissions WHERE team_id = $1', [teamId]);
  if (exists) throw alreadySubmittedError();
  await verifyMember(eventId, teamId, v);

  const url = normalizeProjectUrl(v.projectUrl);
  await assertReachable(url);

  return withTransaction(async (client) => {
    // Lock the room so a "close submissions" can't slip in between the check and the save.
    const { rows: [room] } = await client.query(
      'SELECT projects_status, projects_deadline FROM rooms WHERE id = $1 FOR UPDATE', [team.room_id]);
    if (room.projects_status !== 'open') throw closedError(room.projects_status);
    const late = room.projects_deadline !== null && new Date(room.projects_deadline).getTime() < Date.now();
    // Two teammates pressing submit at the same moment: the first one wins, the second gets "already submitted".
    const { rows: [saved] } = await client.query(
      `INSERT INTO project_submissions (event_id, room_id, team_id, project_name, theme, problem_statement, project_url, submitted_by, is_late)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (team_id) DO NOTHING
       RETURNING is_late`,
      [eventId, team.room_id, teamId, v.projectName, v.theme, v.problemStatement, url, v.memberId, late],
    );
    if (!saved) throw alreadySubmittedError();
    return { late: saved.is_late as boolean };
  });
}

// ---- AI evaluation queue ----

const MAX_ATTEMPTS = 3;
/** How long a project waits after every AI key reported its usage limit (free tiers reset per minute). */
const RATE_LIMIT_RETRY_SECONDS = 60;

/**
 * Evaluates the oldest waiting submission of the event, if any. Several admin pages may run this at the
 * same time: each claims a different submission (SKIP LOCKED), and a claim older than 3 minutes is
 * treated as abandoned (the request that held it timed out). For a pending project, eval_started_at is the
 * earliest time to try it again (set after a usage-limit reply), or NULL for "now".
 */
export async function evaluateNext(eventId: number): Promise<{ processed: number | null; error?: string; retryAfter?: number }> {
  if (!aiConfigured()) throw new AppError(409, 'AI_NOT_CONFIGURED', 'Set OPENAI_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY on the server to turn on AI scoring.');
  const { rows: [job] } = await pool.query(
    `UPDATE project_submissions SET eval_status = 'evaluating', eval_started_at = now(), eval_attempts = eval_attempts + 1
     WHERE id = (
       SELECT id FROM project_submissions
       WHERE event_id = $1 AND ((eval_status = 'pending' AND (eval_started_at IS NULL OR eval_started_at <= now()))
         OR (eval_status = 'evaluating' AND eval_started_at < now() - interval '3 minutes'))
       ORDER BY submitted_at FOR UPDATE SKIP LOCKED LIMIT 1)
     RETURNING id, project_name, theme, problem_statement, project_url, edit_count, eval_attempts`,
    [eventId],
  );
  if (!job) return { processed: null };

  let outcome: { status: 'evaluated' | 'failed' | 'pending'; error?: string; retryAfter?: number };
  try {
    const page = await capturePage(job.project_url);
    const result = await evaluateProject(
      { projectName: job.project_name, theme: job.theme, problemStatement: job.problem_statement, url: job.project_url }, page);
    await pool.query(
      `INSERT INTO project_evaluations (submission_id, project_url, rubric_version, model, criteria, total, max_total, verdict,
         summary, strengths, improvements, page_title, page_chars, screenshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [job.id, job.project_url, RUBRIC_VERSION, result.model, JSON.stringify(result.criteria), result.total, MAX_TOTAL,
        result.verdict, result.summary, result.strengths, result.improvements, page.title, page.text.length, page.screenshot],
    );
    outcome = { status: 'evaluated' };
  } catch (err) {
    const message = (err as Error).message?.slice(0, 500) || 'Evaluation failed';
    if (err instanceof AiRateLimitError) {
      // Not the project's fault: wait for the limit to reset, without using up one of its attempts.
      await pool.query(
        `UPDATE project_submissions SET eval_status = 'pending', eval_attempts = eval_attempts - 1,
           eval_started_at = now() + make_interval(secs => $3)
         WHERE id = $1 AND edit_count = $2 AND eval_status = 'evaluating'`,
        [job.id, job.edit_count, RATE_LIMIT_RETRY_SECONDS],
      );
      return { processed: job.id, error: message, retryAfter: RATE_LIMIT_RETRY_SECONDS };
    }
    // Keep trying on the next runs, then give up and let an admin re-run it.
    outcome = { status: job.eval_attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', error: message };
    await pool.query(
      `INSERT INTO project_evaluations (submission_id, project_url, rubric_version, max_total, verdict, error)
       VALUES ($1, $2, $3, $4, 'error', $5)`,
      [job.id, job.project_url, RUBRIC_VERSION, MAX_TOTAL, message],
    );
  }
  // A resubmission while this ran has already put the project back in the queue: leave it there.
  await pool.query(
    `UPDATE project_submissions SET eval_status = $3, eval_started_at = NULL
     WHERE id = $1 AND edit_count = $2 AND eval_status = 'evaluating'`,
    [job.id, job.edit_count, outcome.status],
  );
  return { processed: job.id, error: outcome.error };
}

// ---- Admin overview ----

interface ProjectRow {
  id: number;
  roomId: number;
  teamId: number;
  teamNumber: number;
  projectName: string;
  theme: string;
  problemStatement: string;
  projectUrl: string;
  submittedAt: string;
  updatedAt: string;
  editCount: number;
  isLate: boolean;
  evalStatus: string;
  /** Set while the project waits for the AI usage limit to reset: when it will be tried again. */
  retryAt: string | null;
  disqualified: boolean;
  adminScore: number | null;
  adminNote: string | null;
  award: string | null;
  reviewedBy: string | null;
  members: string[];
  submittedBy: string | null;
  evaluation: {
    verdict: string;
    total: number | null;
    maxTotal: number;
    criteria: { key: string; label: string; score: number; max: number; reason: string }[];
    summary: string | null;
    strengths: string | null;
    improvements: string | null;
    error: string | null;
    hasScreenshot: boolean;
    model: string | null;
    createdAt: string;
  } | null;
  lastError: string | null;
  finalScore: number | null;
  rank: number | null;
  tied: boolean;
  duplicateOf: string | null;
}

/** Final score: the admin's override when set, else the AI's total. Not evaluable counts as 0. */
const finalScore = (p: Pick<ProjectRow, 'adminScore' | 'evaluation'>) =>
  p.adminScore ?? (p.evaluation && p.evaluation.verdict !== 'error' ? p.evaluation.total : null);

/** Highest score first; ties go to the better Working App score, then to the earlier submission. */
function rankRoom(projects: ProjectRow[]) {
  const appScore = (p: ProjectRow) => p.evaluation?.criteria.find((c) => c.key === 'experience')?.score ?? 0;
  const ranked = projects
    .filter((p) => !p.disqualified && p.finalScore !== null)
    .sort((a, b) => b.finalScore! - a.finalScore! || appScore(b) - appScore(a)
      || new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
  ranked.forEach((p, i) => {
    p.rank = i + 1;
    p.tied = ranked.some((q) => q !== p && q.finalScore === p.finalScore);
  });
  const order = new Map(ranked.map((p, i) => [p.id, i]));
  return projects.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9)
    || new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
}

export async function projectsOverview(eventId: number, prefix: string) {
  const [{ rows: rooms }, { rows: teams }, { rows: subs }] = await Promise.all([
    pool.query<{ id: number; name: string; status: ProjectsStatus; deadline: string | null; resultsLockedAt: string | null }>(
      `SELECT id, name, projects_status AS status, projects_deadline AS deadline, results_locked_at AS "resultsLockedAt"
       FROM rooms WHERE event_id = $1 AND is_active ORDER BY priority`,
      [eventId],
    ),
    pool.query(
      `SELECT t.id, t.room_id, t.team_number, array_agg(p.name ORDER BY s.position) AS members
       FROM (${ACTIVE_TEAMS}) t
       JOIN seats s ON s.team_id = t.id AND s.status = 'assigned'
       JOIN event_participants ep ON ep.id = s.event_participant_id
       JOIN participants p ON p.id = ep.participant_id
       GROUP BY t.id, t.room_id, t.team_number ORDER BY t.team_number`,
      [eventId],
    ),
    pool.query(
      `SELECT ps.*, sp.name AS submitted_by_name,
         ev.verdict, ev.total, ev.max_total, ev.criteria, ev.summary, ev.strengths, ev.improvements, ev.error AS ev_error,
         ev.screenshot IS NOT NULL AS has_screenshot, ev.model, ev.created_at AS ev_created_at,
         (SELECT e2.error FROM project_evaluations e2 WHERE e2.submission_id = ps.id AND e2.verdict = 'error'
            AND e2.project_url = ps.project_url ORDER BY e2.created_at DESC LIMIT 1) AS last_error
       FROM project_submissions ps
       LEFT JOIN event_participants sep ON sep.id = ps.submitted_by
       LEFT JOIN participants sp ON sp.id = sep.participant_id
       LEFT JOIN LATERAL (
         SELECT * FROM project_evaluations e WHERE e.submission_id = ps.id AND e.project_url = ps.project_url
           AND e.verdict <> 'error' ORDER BY e.created_at DESC LIMIT 1) ev ON true
       WHERE ps.event_id = $1`,
      [eventId],
    ),
  ]);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  // The same link submitted by two teams is worth a look (copied, or a teammate in the wrong team).
  const byUrl = new Map<string, any[]>();
  for (const s of subs) {
    const key = s.project_url.toLowerCase().replace(/\/+$/, '');
    byUrl.set(key, [...(byUrl.get(key) ?? []), s]);
  }
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));

  const projects: ProjectRow[] = subs.map((s) => {
    const team = teamById.get(s.team_id);
    const evaluation = s.verdict ? {
      verdict: s.verdict,
      total: s.total,
      maxTotal: s.max_total,
      criteria: s.criteria,
      summary: s.summary,
      strengths: s.strengths,
      improvements: s.improvements,
      error: s.ev_error,
      hasScreenshot: s.has_screenshot,
      model: s.model,
      createdAt: s.ev_created_at,
    } : null;
    const others = (byUrl.get(s.project_url.toLowerCase().replace(/\/+$/, '')) ?? []).filter((o) => o.id !== s.id);
    const row: ProjectRow = {
      id: s.id,
      roomId: s.room_id,
      teamId: s.team_id,
      teamNumber: team?.team_number ?? 0,
      projectName: s.project_name,
      theme: s.theme,
      problemStatement: s.problem_statement,
      projectUrl: s.project_url,
      submittedAt: s.submitted_at,
      updatedAt: s.updated_at,
      editCount: s.edit_count,
      isLate: s.is_late,
      evalStatus: s.eval_status,
      retryAt: s.eval_status === 'pending' && s.eval_started_at && new Date(s.eval_started_at).getTime() > Date.now()
        ? s.eval_started_at : null,
      disqualified: s.disqualified,
      adminScore: s.admin_score,
      adminNote: s.admin_note,
      award: s.award,
      reviewedBy: s.reviewed_by,
      members: team?.members ?? [],
      submittedBy: s.submitted_by_name,
      evaluation,
      lastError: s.last_error,
      finalScore: null,
      rank: null,
      tied: false,
      duplicateOf: others.length
        ? others.map((o) => `${roomName.get(o.room_id) ?? 'Room'} · ${prefix} ${teamById.get(o.team_id)?.team_number ?? '?'}`).join(', ')
        : null,
    };
    row.finalScore = finalScore(row);
    return row;
  });

  const submittedTeams = new Set(subs.map((s) => s.team_id));
  const now = Date.now();
  return {
    aiConfigured: aiConfigured(),
    rubric: { version: RUBRIC_VERSION, maxTotal: MAX_TOTAL, criteria: CRITERIA.map(({ key, label, max }) => ({ key, label, max })) },
    teamNamePrefix: prefix,
    queue: {
      pending: subs.filter((s) => s.eval_status === 'pending').length,
      evaluating: subs.filter((s) => s.eval_status === 'evaluating').length,
      failed: subs.filter((s) => s.eval_status === 'failed').length,
    },
    rooms: rooms.map((room) => {
      const roomTeams = teams.filter((t) => t.room_id === room.id);
      const roomProjects = rankRoom(projects.filter((p) => p.roomId === room.id));
      return {
        ...room,
        deadlinePassed: room.deadline ? new Date(room.deadline).getTime() < now : false,
        teamCount: roomTeams.length,
        submittedCount: roomProjects.length,
        lateCount: roomProjects.filter((p) => p.isLate).length,
        evaluatedCount: roomProjects.filter((p) => p.evalStatus === 'evaluated').length,
        missing: roomTeams.filter((t) => !submittedTeams.has(t.id))
          .map((t) => ({ teamId: t.id, teamNumber: t.team_number, members: t.members })),
        projects: roomProjects,
      };
    }),
  };
}

// ---- Admin actions ----

export async function setRoomsStatus(eventId: number, roomId: number | 'all', status: ProjectsStatus, deadlineMinutes: number | null | undefined) {
  const params: unknown[] = [eventId, status];
  let deadlineSql = 'projects_deadline';
  if (deadlineMinutes === null) deadlineSql = 'NULL';
  else if (deadlineMinutes !== undefined) {
    params.push(deadlineMinutes);
    deadlineSql = `now() + make_interval(mins => $${params.length})`;
  }
  let where = 'event_id = $1 AND is_active';
  if (roomId !== 'all') {
    params.push(roomId);
    where += ` AND id = $${params.length}`;
  }
  const { rowCount } = await pool.query(
    `UPDATE rooms SET projects_status = $2, projects_deadline = ${deadlineSql}, updated_at = now()
     WHERE ${where} AND results_locked_at IS NULL`,
    params,
  );
  if (!rowCount) throw new AppError(409, 'ROOM_LOCKED', 'No room changed. Rooms whose results are locked can’t reopen submissions.');
  return { updated: rowCount };
}

async function loadSubmission(eventId: number, id: number) {
  const { rows: [s] } = await pool.query(
    `SELECT ps.id, ps.room_id, r.results_locked_at FROM project_submissions ps JOIN rooms r ON r.id = ps.room_id
     WHERE ps.id = $1 AND ps.event_id = $2`,
    [id, eventId],
  );
  if (!s) throw notFound('Project');
  return s;
}

const lockedError = () => new AppError(409, 'RESULTS_LOCKED', 'This room’s results are locked. Unlock them to make changes.');

export const reviewInput = z.object({
  adminScore: z.number().min(0).max(MAX_TOTAL).nullable().optional(),
  adminNote: z.string().trim().max(500).nullable().optional(),
  disqualified: z.boolean().optional(),
});

export async function reviewSubmission(eventId: number, id: number, v: z.infer<typeof reviewInput>, actor: string) {
  const s = await loadSubmission(eventId, id);
  if (s.results_locked_at) throw lockedError();
  const sets: string[] = [];
  const params: unknown[] = [id];
  const add = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`); };
  if (v.adminScore !== undefined) add('admin_score', v.adminScore === null ? null : Math.round(v.adminScore * 10) / 10);
  if (v.adminNote !== undefined) add('admin_note', v.adminNote || null);
  if (v.disqualified !== undefined) {
    add('disqualified', v.disqualified);
    if (v.disqualified) sets.push('award = NULL');
  }
  if (!sets.length) return { ok: true };
  add('reviewed_by', actor);
  sets.push('reviewed_at = now()');
  await pool.query(`UPDATE project_submissions SET ${sets.join(', ')} WHERE id = $1`, params);
  return { ok: true };
}

/** Removes a team's submission (and its scores) so the team can submit again, e.g. after a wrong link. */
export async function deleteSubmission(eventId: number, id: number, actor: string) {
  const s = await loadSubmission(eventId, id);
  if (s.results_locked_at) throw lockedError();
  const { rows: [gone] } = await pool.query(
    'DELETE FROM project_submissions WHERE id = $1 RETURNING event_id, room_id, team_id, project_name, project_url', [id]);
  await logAllocation(pool, eventId, 'project_submission_removed', gone ?? { id }, actor);
  return { ok: true };
}

export async function requeueSubmission(eventId: number, id: number) {
  await loadSubmission(eventId, id);
  await pool.query(
    `UPDATE project_submissions SET eval_status = 'pending', eval_started_at = NULL, eval_attempts = 0 WHERE id = $1`, [id]);
  return { ok: true };
}

export const awardsInput = z.object({
  winner: z.number().int().positive().nullable(),
  runner_up: z.number().int().positive().nullable(),
  second_runner_up: z.number().int().positive().nullable(),
});

export async function setAwards(eventId: number, roomId: number, v: z.infer<typeof awardsInput>, actor: string) {
  const picks = Object.entries(v).filter(([, id]) => id !== null) as [string, number][];
  if (new Set(picks.map(([, id]) => id)).size !== picks.length) throw badRequest('Each team can get only one award.');
  return withTransaction(async (client) => {
    const { rows: [room] } = await client.query(
      'SELECT results_locked_at FROM rooms WHERE id = $1 AND event_id = $2 FOR UPDATE', [roomId, eventId]);
    if (!room) throw notFound('Room');
    if (room.results_locked_at) throw lockedError();
    if (picks.length) {
      const { rows } = await client.query(
        'SELECT id FROM project_submissions WHERE room_id = $1 AND id = ANY($2::int[]) AND NOT disqualified',
        [roomId, picks.map(([, id]) => id)]);
      if (rows.length !== picks.length) throw badRequest('Awards can only go to projects in this room that aren’t disqualified.');
    }
    await client.query('UPDATE project_submissions SET award = NULL WHERE room_id = $1 AND award IS NOT NULL', [roomId]);
    for (const [award, id] of picks) {
      await client.query('UPDATE project_submissions SET award = $2, reviewed_by = $3, reviewed_at = now() WHERE id = $1', [id, award, actor]);
    }
    return { ok: true };
  });
}

export async function setResultsLock(eventId: number, roomId: number, locked: boolean) {
  const { rowCount } = await pool.query(
    `UPDATE rooms SET results_locked_at = ${locked ? 'now()' : 'NULL'},
       projects_status = CASE WHEN $3 THEN 'closed' ELSE projects_status END, updated_at = now()
     WHERE id = $1 AND event_id = $2`,
    [roomId, eventId, locked],
  );
  if (!rowCount) throw notFound('Room');
  return { ok: true };
}

export async function screenshotOf(eventId: number, id: number): Promise<Buffer | null> {
  const { rows: [row] } = await pool.query(
    `SELECT e.screenshot FROM project_evaluations e JOIN project_submissions ps ON ps.id = e.submission_id
     WHERE ps.id = $1 AND ps.event_id = $2 AND e.project_url = ps.project_url AND e.screenshot IS NOT NULL
     ORDER BY e.created_at DESC LIMIT 1`,
    [id, eventId],
  );
  return row?.screenshot ?? null;
}
