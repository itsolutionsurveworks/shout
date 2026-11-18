-- Group profile photos. Run once in the Supabase SQL editor (after schema.sql).
-- Admins/developers, the group's creator and its members can upload or replace the photo.
-- Re-running is safe: policies are dropped first.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('group-avatars', 'group-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION can_edit_group_photo(gid UUID) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_admin_role()
    OR EXISTS (SELECT 1 FROM groups WHERE id = gid AND created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM group_members WHERE group_id = gid AND user_id = auth.uid())
$$;

DROP POLICY IF EXISTS "Admins upload group avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete group avatars" ON storage.objects;
DROP POLICY IF EXISTS "Group people upload group avatars" ON storage.objects;
DROP POLICY IF EXISTS "Group people delete group avatars" ON storage.objects;

-- Files live at group-avatars/<group-id>/<timestamp>.webp
CREATE POLICY "Group people upload group avatars" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'group-avatars' AND can_edit_group_photo(((storage.foldername(name))[1])::uuid));

CREATE POLICY "Group people delete group avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'group-avatars' AND can_edit_group_photo(((storage.foldername(name))[1])::uuid));

-- Members and the creator may update a group row, but a trigger limits them to name + avatar_url.
DROP POLICY IF EXISTS "Group people update photo" ON groups;
CREATE POLICY "Group people update photo" ON groups FOR UPDATE TO authenticated
  USING (can_edit_group_photo(id)) WITH CHECK (can_edit_group_photo(id));

CREATE OR REPLACE FUNCTION guard_group_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin_role()
     AND NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'Only admins can change who created a group';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS groups_guard ON groups;
CREATE TRIGGER groups_guard BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION guard_group_update();
