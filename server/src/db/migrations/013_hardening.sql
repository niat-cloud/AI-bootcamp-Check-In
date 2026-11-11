-- Hardening from the backend review (TODO_backend-architect.md).

-- ARCH-ITEM-2.1: indexes for the hot paths. The phone lookup joins registrations by participant; the
-- dashboard and waiting list filter registrations by event and status.
CREATE INDEX IF NOT EXISTS event_participants_participant_idx ON event_participants (participant_id);
CREATE INDEX IF NOT EXISTS event_participants_event_status_idx ON event_participants (event_id, status);
CREATE INDEX IF NOT EXISTS admin_locations_location_idx ON admin_locations (location_id);

-- ARCH-ITEM-3.2: bumping this signs the admin out on every device (tokens carry the version they were issued with).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- ARCH-ITEM-3.3: sign-in and sign-up limits shared by every server instance (serverless instances don't share memory).
CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL
);

-- ARCH-ITEM-3.4: who changed what, for admin actions that change data.
CREATE TABLE IF NOT EXISTS admin_audit (
  id         BIGSERIAL PRIMARY KEY,
  admin_id   INTEGER REFERENCES admin_users (id) ON DELETE SET NULL,
  admin_email TEXT,
  event_id   INTEGER REFERENCES events (id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  target     TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_event_idx ON admin_audit (event_id, created_at DESC);

-- down:
-- DROP TABLE IF EXISTS admin_audit; DROP TABLE IF EXISTS rate_limits;
-- ALTER TABLE admin_users DROP COLUMN IF EXISTS token_version;
-- DROP INDEX IF EXISTS admin_locations_location_idx, event_participants_event_status_idx, event_participants_participant_idx;
