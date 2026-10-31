export type ProjectsStatus = 'not_open' | 'open' | 'closed';
export type Award = 'winner' | 'runner_up' | 'second_runner_up';

export interface CriterionScore {
  key: string;
  label: string;
  score: number;
  max: number;
  reason: string;
}

export interface Project {
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
  evalStatus: 'pending' | 'evaluating' | 'evaluated' | 'failed';
  /** While the AI usage limit resets: when this project will be tried again. */
  retryAt: string | null;
  disqualified: boolean;
  adminScore: number | null;
  adminNote: string | null;
  award: Award | null;
  reviewedBy: string | null;
  members: string[];
  submittedBy: string | null;
  evaluation: {
    verdict: 'scored' | 'not_evaluable';
    total: number | null;
    maxTotal: number;
    criteria: CriterionScore[];
    summary: string | null;
    strengths: string | null;
    improvements: string | null;
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

export interface ProjectRoom {
  id: number;
  name: string;
  status: ProjectsStatus;
  deadline: string | null;
  deadlinePassed: boolean;
  resultsLockedAt: string | null;
  teamCount: number;
  submittedCount: number;
  lateCount: number;
  evaluatedCount: number;
  missing: { teamId: number; teamNumber: number; members: string[] }[];
  projects: Project[];
}

export interface ProjectsOverview {
  aiConfigured: boolean;
  rubric: { version: string; maxTotal: number; criteria: { key: string; label: string; max: number }[] };
  teamNamePrefix: string;
  queue: { pending: number; evaluating: number; failed: number };
  rooms: ProjectRoom[];
}

/** The top of each room's ranking that the judges review. */
export const SHORTLIST_SIZE = 5;

export const AWARDS: { key: Award; label: string; short: string; tone: string }[] = [
  { key: 'winner', label: 'Winner', short: '🏆 Winner', tone: 'bg-amber-100 text-amber-900 ring-amber-300' },
  { key: 'runner_up', label: 'Runner-up', short: '🥈 Runner-up', tone: 'bg-slate-100 text-slate-800 ring-slate-300' },
  { key: 'second_runner_up', label: '2nd Runner-up', short: '🥉 2nd Runner-up', tone: 'bg-orange-50 text-orange-900 ring-orange-200' },
];

export const STATUS_LABEL: Record<ProjectsStatus, string> = {
  not_open: 'Not open yet',
  open: 'Open',
  closed: 'Closed',
};

/** Problems an admin should look at before trusting the ranking. */
export function flagsOf(p: Project): { text: string; tone: 'warn' | 'info' }[] {
  const flags: { text: string; tone: 'warn' | 'info' }[] = [];
  if (p.evalStatus === 'failed') flags.push({ text: 'AI scoring failed', tone: 'warn' });
  if (p.evaluation?.verdict === 'not_evaluable') flags.push({ text: 'Nothing to judge on the page', tone: 'warn' });
  if (p.duplicateOf) flags.push({ text: `Same link as ${p.duplicateOf}`, tone: 'warn' });
  if (p.isLate) flags.push({ text: 'Late', tone: 'info' });
  if (p.editCount > 0) flags.push({ text: `Edited ${p.editCount}×`, tone: 'info' });
  return flags;
}

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
