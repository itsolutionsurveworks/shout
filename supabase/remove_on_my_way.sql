-- Removes the 'on_my_way' status (the On My Way button was dropped).
-- Run once in the Supabase SQL editor on databases where notif_on_my_way.sql was already applied.
-- Existing 'on_my_way' replies become 'acknowledged'.

BEGIN;

-- The insert policy compares status, which blocks changing the column type; recreate it after.
DROP POLICY IF EXISTS "Senders create notifications" ON notifications;
ALTER TABLE notifications ALTER COLUMN status DROP DEFAULT;

ALTER TYPE notif_status RENAME TO notif_status_old;
CREATE TYPE notif_status AS ENUM ('sent', 'delivered', 'acknowledged');

-- Column type change does not fire the guard trigger, so existing rows are converted safely.
ALTER TABLE notifications
  ALTER COLUMN status TYPE notif_status
  USING (CASE WHEN status::text = 'on_my_way' THEN 'acknowledged' ELSE status::text END)::notif_status;

ALTER TABLE notifications ALTER COLUMN status SET DEFAULT 'sent';
DROP TYPE notif_status_old;

CREATE POLICY "Senders create notifications" ON notifications FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND status = 'sent'
              AND current_role_of_user() IN ('admin', 'sender'));

-- Guard trigger function without the removed status (same rules as chat_batches.sql).
CREATE OR REPLACE FUNCTION guard_notification_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.recipient_id <> OLD.recipient_id
     OR NEW.message <> OLD.message OR NEW.created_at <> OLD.created_at
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    RAISE EXCEPTION 'Only status fields may be updated';
  END IF;
  IF NEW.status = 'delivered' AND OLD.status = 'sent' THEN
    NEW.delivered_at := NOW();
  ELSIF NEW.status = 'acknowledged' THEN
    NEW.acknowledged_at := NOW();
    NEW.delivered_at := COALESCE(OLD.delivered_at, NOW());
  ELSIF NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid status transition';
  END IF;
  RETURN NEW;
END $$;

COMMIT;
