-- Run AFTER developer_role_enum.sql and developer_role.sql.
-- Developers get everything admins get (Admin/Dev tab, managing people, groups and the audit log).
-- The developer role itself is still locked: only the Supabase dashboard can assign or remove it
-- (see guard_profile_update below, which is unchanged in that respect).

CREATE OR REPLACE FUNCTION is_admin_role() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT current_role_of_user() IN ('admin', 'developer') $$;

CREATE OR REPLACE FUNCTION guard_profile_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NEW.role <> OLD.role AND (OLD.role = 'developer' OR NEW.role = 'developer') THEN
      RAISE EXCEPTION 'The developer role can only be changed in the Supabase dashboard';
    END IF;
    IF NOT is_admin_role()
       AND (NEW.role <> OLD.role OR NEW.department <> OLD.department
            OR NEW.email <> OLD.email OR NEW.full_name <> OLD.full_name) THEN
      RAISE EXCEPTION 'Only admins can change these fields';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "Admins manage profiles" ON profiles;
CREATE POLICY "Admins manage profiles" ON profiles FOR ALL TO authenticated
  USING (is_admin_role()) WITH CHECK (is_admin_role());

DROP POLICY IF EXISTS "Admins manage groups" ON groups;
CREATE POLICY "Admins manage groups" ON groups FOR ALL TO authenticated
  USING (is_admin_role()) WITH CHECK (is_admin_role());

DROP POLICY IF EXISTS "Admins manage members" ON group_members;
CREATE POLICY "Admins manage members" ON group_members FOR ALL TO authenticated
  USING (is_admin_role()) WITH CHECK (is_admin_role());

DROP POLICY IF EXISTS "Senders create notifications" ON notifications;
CREATE POLICY "Senders create notifications" ON notifications FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND status = 'sent'
              AND (is_admin_role() OR current_role_of_user() = 'sender'));

DROP POLICY IF EXISTS "Read own notifications" ON notifications;
CREATE POLICY "Read own notifications" ON notifications FOR SELECT TO authenticated
  USING (auth.uid() IN (recipient_id, sender_id) OR is_admin_role());
