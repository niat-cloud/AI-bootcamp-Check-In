import { Router, type Request } from 'express';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { adminOf } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import {
  awardsInput, evaluateNext, projectsOverview, requeueSubmission, reviewInput, reviewSubmission, screenshotOf,
  setAwards, setResultsLock, setRoomsStatus,
} from '../services/projects.js';
import { loadEvent } from './events.js';

/** Projects & judging, mounted under /api/events/:id. */
export const projectsRouter = Router({ mergeParams: true });

const eventIdOf = (req: Request) => Number((req.params as Record<string, string>).id);
const actorOf = (req: Request) => adminOf(req).email;

projectsRouter.get('/projects', async (req, res) => {
  const event = await loadEvent(eventIdOf(req));
  res.json(await projectsOverview(event.id, event.teamNamePrefix));
});

/** Open or close submissions for one room (or every room). deadlineMinutes: null clears the deadline. */
projectsRouter.post('/projects/rooms/:roomId/status', async (req, res) => {
  const v = z.object({
    status: z.enum(['not_open', 'open', 'closed']),
    deadlineMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  }).parse(req.body);
  const raw = (req.params as Record<string, string>).roomId;
  const roomId = raw === 'all' ? 'all' : Number(raw);
  res.json(await setRoomsStatus(eventIdOf(req), roomId, v.status, v.deadlineMinutes));
});

/** Evaluates the next waiting project. The admin Projects page calls this in a loop while it's open. */
projectsRouter.post('/projects/evaluate-next', async (req, res) => {
  res.json(await evaluateNext(eventIdOf(req)));
});

projectsRouter.post('/projects/:submissionId/re-evaluate', async (req, res) => {
  res.json(await requeueSubmission(eventIdOf(req), Number(req.params.submissionId)));
});

projectsRouter.patch('/projects/:submissionId', async (req, res) => {
  const v = reviewInput.parse(req.body);
  res.json(await reviewSubmission(eventIdOf(req), Number(req.params.submissionId), v, actorOf(req)));
});

projectsRouter.post('/projects/rooms/:roomId/awards', async (req, res) => {
  const v = awardsInput.parse(req.body);
  res.json(await setAwards(eventIdOf(req), Number(req.params.roomId), v, actorOf(req)));
});

projectsRouter.post('/projects/rooms/:roomId/lock', async (req, res) => {
  const { locked } = z.object({ locked: z.boolean() }).parse(req.body);
  res.json(await setResultsLock(eventIdOf(req), Number(req.params.roomId), locked));
});

/** The page as the AI saw it. Opened in an <img>, so the session token comes in the query string. */
projectsRouter.get('/projects/:submissionId/screenshot', async (req, res) => {
  const image = await screenshotOf(eventIdOf(req), Number(req.params.submissionId));
  if (!image) throw notFound('Screenshot');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(image);
});

const AWARD_LABEL: Record<string, string> = { winner: 'Winner', runner_up: 'Runner-up', second_runner_up: '2nd Runner-up' };

projectsRouter.get('/projects/export', async (req, res) => {
  const event = await loadEvent(eventIdOf(req));
  const overview = await projectsOverview(event.id, event.teamNamePrefix);
  const criteria = overview.rubric.criteria;
  const data = overview.rooms.flatMap((room) => room.projects.map((p) => ({
    Room: room.name,
    Rank: p.rank ?? '',
    Award: p.award ? AWARD_LABEL[p.award] : '',
    Team: `${event.teamNamePrefix} ${p.teamNumber}`,
    Members: p.members.join(', '),
    Project: p.projectName,
    Theme: p.theme,
    Problem: p.problemStatement,
    Link: p.projectUrl,
    [`Final Score (/${overview.rubric.maxTotal})`]: p.finalScore ?? '',
    'AI Score': p.evaluation?.total ?? '',
    'Admin Score': p.adminScore ?? '',
    ...Object.fromEntries(criteria.map((c) => [`${c.label} (/${c.max})`, p.evaluation?.criteria.find((x) => x.key === c.key)?.score ?? ''])),
    'AI Summary': p.evaluation?.summary ?? '',
    Strengths: p.evaluation?.strengths ?? '',
    Improvements: p.evaluation?.improvements ?? '',
    Late: p.isLate ? 'Yes' : '',
    Disqualified: p.disqualified ? 'Yes' : '',
    'Admin Note': p.adminNote ?? '',
    'Submitted At': new Date(p.updatedAt).toISOString(),
  })));
  const sheet = XLSX.utils.json_to_sheet(data);
  const safeName = `${event.name}-${event.date}-projects`.replace(/[^\w-]+/g, '_');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
  res.send('﻿' + XLSX.utils.sheet_to_csv(sheet));
});
