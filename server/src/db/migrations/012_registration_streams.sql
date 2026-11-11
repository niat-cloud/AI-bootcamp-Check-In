-- Streams as the registration form lists them (PCM / MPC, PCMB, PCM + CS, PCM + E, PCM + S, Commerce, Arts).
-- The earlier codes stay valid so answers already given keep working.
ALTER TABLE event_participants DROP CONSTRAINT IF EXISTS event_participants_stream_check;
ALTER TABLE event_participants ADD CONSTRAINT event_participants_stream_check
  CHECK (stream IN ('maths', 'pcmb', 'pcm_cs', 'pcm_e', 'pcm_s', 'commerce', 'arts', 'biology', 'other'));
