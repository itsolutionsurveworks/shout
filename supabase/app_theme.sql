-- Run once in the Supabase SQL editor. Safe to re-run.
-- Single-row theme setting. Only developers can change it; everyone else reads it.
-- To add a new theme later: add its key to the CHECK list below AND to src/lib/themes.ts.

CREATE TABLE IF NOT EXISTS app_theme (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  theme_key TEXT NOT NULL DEFAULT 'default'
    CHECK (theme_key IN ('default', 'christmas', 'halloween', 'new_year')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO app_theme (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_theme ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read app theme" ON app_theme;
CREATE POLICY "Authenticated read app theme" ON app_theme FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Developers edit app theme" ON app_theme;
CREATE POLICY "Developers edit app theme" ON app_theme FOR UPDATE TO authenticated
  USING (current_role_of_user() = 'developer') WITH CHECK (current_role_of_user() = 'developer');

-- Safe to re-run: only add to the realtime publication if not already there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'app_theme') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_theme;
  END IF;
END $$;
