-- Projects: each team submits one project link per event, the AI scores it, and each room picks its winners.
-- Additive only.

-- Submissions are controlled per room, because rooms start and finish their build time separately.
--   not_open: the room hasn't started; open: teams can submit; closed: no more submissions.
-- projects_deadline is soft: after it, submissions still go through but are marked late.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS projects_status TEXT NOT NULL DEFAULT 'not_open'
  CHECK (projects_status IN ('not_open', 'open', 'closed'));
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS projects_deadline TIMESTAMPTZ;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS results_locked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS project_submissions (
  id                 SERIAL PRIMARY KEY,
  event_id           INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  room_id            INTEGER NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  team_id            INTEGER NOT NULL UNIQUE REFERENCES teams (id) ON DELETE CASCADE,
  project_name       TEXT NOT NULL,
  theme              TEXT NOT NULL,
  problem_statement  TEXT NOT NULL,
  project_url        TEXT NOT NULL,
  submitted_by       INTEGER REFERENCES event_participants (id) ON DELETE SET NULL,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  edit_count         INTEGER NOT NULL DEFAULT 0,
  is_late            BOOLEAN NOT NULL DEFAULT false,
  -- AI evaluation queue: pending → evaluating → evaluated | failed.
  eval_status        TEXT NOT NULL DEFAULT 'pending' CHECK (eval_status IN ('pending', 'evaluating', 'evaluated', 'failed')),
  eval_started_at    TIMESTAMPTZ,
  eval_attempts      INTEGER NOT NULL DEFAULT 0,
  -- Admin review. final score = admin_score when set, else the AI's total.
  admin_score        NUMERIC(5, 1),
  admin_note         TEXT,
  disqualified       BOOLEAN NOT NULL DEFAULT false,
  award              TEXT CHECK (award IN ('winner', 'runner_up', 'second_runner_up')),
  reviewed_by        TEXT,
  reviewed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS project_submissions_event_idx ON project_submissions (event_id, room_id);
CREATE INDEX IF NOT EXISTS project_submissions_queue_idx ON project_submissions (event_id, submitted_at)
  WHERE eval_status IN ('pending', 'evaluating');
-- One of each award per room.
CREATE UNIQUE INDEX IF NOT EXISTS project_submissions_award_idx ON project_submissions (room_id, award) WHERE award IS NOT NULL;

-- Every AI run is kept (a resubmission or re-run adds a new row); the newest one counts.
CREATE TABLE IF NOT EXISTS project_evaluations (
  id              SERIAL PRIMARY KEY,
  submission_id   INTEGER NOT NULL REFERENCES project_submissions (id) ON DELETE CASCADE,
  project_url     TEXT NOT NULL,
  rubric_version  TEXT NOT NULL,
  model           TEXT,
  -- [{ key, score, max, reason }]
  criteria        JSONB NOT NULL DEFAULT '[]'::jsonb,
  total           NUMERIC(5, 1),
  max_total       INTEGER NOT NULL,
  verdict         TEXT NOT NULL CHECK (verdict IN ('scored', 'not_evaluable', 'error')),
  summary         TEXT,
  strengths       TEXT,
  improvements    TEXT,
  page_title      TEXT,
  page_chars      INTEGER,
  screenshot      BYTEA,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_evaluations_submission_idx ON project_evaluations (submission_id, created_at DESC);
