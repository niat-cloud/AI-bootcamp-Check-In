-- The quick questions every student answers at check-in. They belong to this event, not the person:
-- the same student may be in another class, or eat differently next time.
ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS grade TEXT CHECK (grade IN ('class_11', 'class_12', 'passed_12', 'college', 'other')),
  ADD COLUMN IF NOT EXISTS stream TEXT CHECK (stream IN ('maths', 'biology', 'pcmb', 'commerce', 'arts', 'other')),
  -- "Other" class or stream in the student's words, or a college student's course.
  ADD COLUMN IF NOT EXISTS study_detail TEXT,
  ADD COLUMN IF NOT EXISTS lunch TEXT CHECK (lunch IN ('veg', 'non_veg')),
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
