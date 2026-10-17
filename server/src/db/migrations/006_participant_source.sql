-- Marketing source of each registration (CBA, Pass, DM, Outbound …), set from the imported sheet.
-- Kept per event, since the same person can come to different events through different channels.
-- Admin-only: never returned by the public check-in endpoints. NULL for walk-ins and rows without a source.
ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS source TEXT;
