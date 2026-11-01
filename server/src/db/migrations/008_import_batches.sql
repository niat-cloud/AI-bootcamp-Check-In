-- Every participant import (file upload or copy from another event) is recorded, so a wrong import can be
-- removed as a whole. Registrations made before this migration have no batch; they show as "earlier imports".
-- Additive only.

CREATE TABLE IF NOT EXISTS import_batches (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('file', 'copy')),
  label       TEXT NOT NULL,
  row_count   INTEGER NOT NULL DEFAULT 0,
  added_count INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at  TIMESTAMPTZ,
  removed_by  TEXT
);
CREATE INDEX IF NOT EXISTS import_batches_event_idx ON import_batches (event_id, created_at DESC);

-- The import that first added this registration. A later re-import of the same person keeps the original.
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS import_batch_id INTEGER REFERENCES import_batches (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS event_participants_import_batch_idx ON event_participants (import_batch_id) WHERE import_batch_id IS NOT NULL;
