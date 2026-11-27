-- Only developers may read other people's notifications (the audit log). Run once in the SQL editor.
-- Everyone, admins included, still reads their own conversations (sender or recipient).
-- Also keeps Realtime quiet: postgres_changes only delivers rows a user may read.
-- Safe to re-run.
DROP POLICY IF EXISTS "Read own notifications" ON notifications;
CREATE POLICY "Read own notifications" ON notifications FOR SELECT TO authenticated
  USING (auth.uid() IN (recipient_id, sender_id) OR current_role_of_user() = 'developer');
