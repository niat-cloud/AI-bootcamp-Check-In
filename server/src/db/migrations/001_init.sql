CREATE TABLE events (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  event_date          DATE NOT NULL,
  event_time          TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  expected_students   INTEGER NOT NULL DEFAULT 0 CHECK (expected_students >= 0),
  team_size           INTEGER NOT NULL DEFAULT 3 CHECK (team_size BETWEEN 2 AND 8),
  seat_labels         TEXT[] NOT NULL DEFAULT ARRAY['A', 'B', 'C'],
  team_name_prefix    TEXT NOT NULL DEFAULT 'Team',
  active_pool_size    INTEGER NOT NULL DEFAULT 5 CHECK (active_pool_size >= 1),
  pool_fill_threshold NUMERIC(4, 3) NOT NULL DEFAULT 0.6 CHECK (pool_fill_threshold > 0 AND pool_fill_threshold <= 1),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  CHECK (array_length(seat_labels, 1) = team_size)
);

-- Only one active event at a time.
CREATE UNIQUE INDEX one_active_event ON events ((true)) WHERE status = 'active';

CREATE TABLE rooms (
  id        SERIAL PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  capacity  INTEGER NOT NULL CHECK (capacity > 0),
  priority  INTEGER NOT NULL,
  UNIQUE (event_id, priority)
);

CREATE TABLE participants (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL UNIQUE,
  parent_phone   TEXT,
  school_college TEXT NOT NULL DEFAULT '',
  class          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  room_id     INTEGER NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  UNIQUE (event_id, team_number)
);

CREATE TABLE event_participants (
  id                SERIAL PRIMARY KEY,
  event_id          INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  participant_id    INTEGER NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  registration_type TEXT NOT NULL CHECK (registration_type IN ('existing', 'walk_in')),
  status            TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in')),
  check_in_time     TIMESTAMPTZ,
  room_id           INTEGER REFERENCES rooms (id),
  team_id           INTEGER REFERENCES teams (id),
  seat_id           INTEGER UNIQUE,
  seat_label        TEXT,
  assigned_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, participant_id)
);

CREATE TABLE seats (
  id                   SERIAL PRIMARY KEY,
  event_id             INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  team_id              INTEGER NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  label                TEXT NOT NULL,
  position             INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned')),
  event_participant_id INTEGER UNIQUE REFERENCES event_participants (id),
  UNIQUE (event_id, team_id, label),
  CHECK ((status = 'assigned') = (event_participant_id IS NOT NULL))
);

ALTER TABLE event_participants
  ADD CONSTRAINT event_participants_seat_fk FOREIGN KEY (seat_id) REFERENCES seats (id);

CREATE INDEX event_participants_event_idx ON event_participants (event_id);
CREATE INDEX teams_room_idx ON teams (room_id);
CREATE INDEX seats_team_idx ON seats (team_id);
