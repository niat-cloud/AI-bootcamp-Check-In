-- Rooms & Teams: room-local team numbering, per-room capacity control, an arrival waiting list, and an audit log.
-- Additive only: no existing student, seat or assignment row is changed or removed.

-- Per-room settings. team_size NULL means "use the event's team size".
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS team_size INTEGER CHECK (team_size BETWEEN 2 AND 8);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Priorities can be swapped inside one transaction.
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_event_id_priority_key;
ALTER TABLE rooms ADD CONSTRAINT rooms_event_id_priority_key UNIQUE (event_id, priority) DEFERRABLE INITIALLY IMMEDIATE;

-- Team numbers restart at 1 in every room. Earlier events keep their (still unique) numbers.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_event_id_team_number_key;
ALTER TABLE teams ADD CONSTRAINT teams_room_id_team_number_key UNIQUE (room_id, team_number);

-- Students who arrive while every approved seat is taken wait here instead of being turned away.
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
UPDATE event_participants SET arrived_at = check_in_time WHERE arrived_at IS NULL AND check_in_time IS NOT NULL;
ALTER TABLE event_participants DROP CONSTRAINT IF EXISTS event_participants_status_check;
ALTER TABLE event_participants ADD CONSTRAINT event_participants_status_check
  CHECK (status IN ('registered', 'waiting', 'checked_in'));
CREATE INDEX IF NOT EXISTS event_participants_waiting_idx
  ON event_participants (event_id, arrived_at) WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS allocation_log (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  action     TEXT NOT NULL,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS allocation_log_event_idx ON allocation_log (event_id, created_at DESC);
