-- Multi-location platform: locations, admin accounts with roles and approval, and a public link per event.
-- Backward compatible with the previous app version: new event columns are nullable and enforced in code.

CREATE TABLE IF NOT EXISTS locations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  city       TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT '',
  slug       TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id                   SERIAL PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL DEFAULT '',
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'location_admin' CHECK (role IN ('super_admin', 'location_admin')),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
  requested_location_id INTEGER REFERENCES locations (id) ON DELETE SET NULL,
  request_note         TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at           TIMESTAMPTZ,
  decided_by           TEXT,
  last_login_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_locations (
  admin_id    INTEGER NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  PRIMARY KEY (admin_id, location_id)
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations (id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS slug TEXT CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE events ADD CONSTRAINT events_location_slug_key UNIQUE (location_id, slug);
CREATE INDEX IF NOT EXISTS events_location_idx ON events (location_id, event_date DESC);

-- Several events (in different locations, or even the same one) may now run at the same time.
DROP INDEX IF EXISTS one_active_event;

-- Every event so far ran in Hyderabad.
INSERT INTO locations (name, city, state, slug)
SELECT 'Hyderabad', 'Hyderabad', 'Telangana', 'hyderabad'
WHERE NOT EXISTS (SELECT 1 FROM locations);

UPDATE events SET location_id = (SELECT id FROM locations ORDER BY id LIMIT 1) WHERE location_id IS NULL;

-- Links for existing events: 18-oct-2026, then 18-oct-2026-2 for a second event on the same day.
WITH numbered AS (
  SELECT id, lower(to_char(event_date, 'FMDD-Mon-YYYY')) AS base,
         row_number() OVER (PARTITION BY location_id, event_date ORDER BY id) AS n
  FROM events WHERE slug IS NULL)
UPDATE events e SET slug = CASE WHEN n.n = 1 THEN n.base ELSE n.base || '-' || n.n END
FROM numbered n WHERE n.id = e.id;
