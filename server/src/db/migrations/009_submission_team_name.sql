-- The name a team gives itself when it submits ("Code Crusaders"), shown next to "Team 7" on the admin
-- pages and the award screen. NULL for submissions made before this field existed.
ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS team_name TEXT;
