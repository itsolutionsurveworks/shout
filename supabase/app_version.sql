-- Run once in the Supabase SQL editor. Safe to re-run.
-- Each signed-in app reports its version to its own profile row, so the Dev tab can show
-- which accounts are on the latest version, including accounts that are offline.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_version TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS app_version_at TIMESTAMPTZ;

-- Users can only report for themselves (auth.uid()), so no broad update policy is needed.
CREATE OR REPLACE FUNCTION report_app_version(v TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles SET app_version = v, app_version_at = NOW() WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION report_app_version(TEXT) TO authenticated;
