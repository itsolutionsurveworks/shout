-- Step 2 of 2: run AFTER developer_role_enum.sql.
-- Developer role rules:
--   * Only the Supabase dashboard / SQL editor (no auth.uid()) can give or remove the developer role.
--   * Admins cannot change a developer's role, and cannot assign developer to anyone.
--   * Developers can set the message shown to the left of the refresh button.

-- Role guard: admins may still manage everyone else, but never touch the developer role.
CREATE OR REPLACE FUNCTION guard_profile_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role <> OLD.role AND (OLD.role = 'developer' OR NEW.role = 'developer') THEN
      RAISE EXCEPTION 'The developer role can only be changed in the Supabase dashboard';
    END IF;
    IF current_role_of_user() <> 'admin'
       AND (NEW.role <> OLD.role OR NEW.department <> OLD.department
            OR NEW.email <> OLD.email OR NEW.full_name <> OLD.full_name) THEN
      RAISE EXCEPTION 'Only admins can change these fields';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Single-row message shown in the app header, left of the refresh button.
CREATE TABLE IF NOT EXISTS header_message (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 200),
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO header_message (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE header_message ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read header message" ON header_message;
CREATE POLICY "Authenticated read header message" ON header_message FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Developers edit header message" ON header_message;
CREATE POLICY "Developers edit header message" ON header_message FOR UPDATE TO authenticated
  USING (current_role_of_user() = 'developer') WITH CHECK (current_role_of_user() = 'developer');

-- Safe to re-run: only add to the realtime publication if not already there.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'header_message') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE header_message;
  END IF;
END $$;
