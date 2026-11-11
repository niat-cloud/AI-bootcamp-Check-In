-- The parent's or guardian's name, collected with their mobile number.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS parent_name TEXT;
