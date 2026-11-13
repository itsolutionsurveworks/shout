-- Run once in the Supabase SQL editor. Safe to re-run.
-- Single-row "push update" signal. A developer presses "Push update" in the Dev tab, which
-- sets pushed_at to now(). Every open app is subscribed to this row and checks for a new
-- release the moment it changes.

CREATE TABLE IF NOT EXISTS app_update (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_update (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_update ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read app update" ON app_update;
CREATE POLICY "Authenticated read app update" ON app_update FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Developers edit app update" ON app_update;
CREATE POLICY "Developers edit app update" ON app_update FOR UPDATE TO authenticated
  USING (current_role_of_user() = 'developer') WITH CHECK (current_role_of_user() = 'developer');

-- Safe to re-run: only add to the realtime publication if not already there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'app_update') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_update;
  END IF;
END $$;
