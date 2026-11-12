-- Adds the 'on_my_way' status so senders can tell "Acknowledged" from "On My Way".
-- Run once in the Supabase SQL editor (after schema.sql and quick_shouts.sql).

ALTER TYPE notif_status ADD VALUE IF NOT EXISTS 'on_my_way';

-- Same guard as before, extended to accept the new status.
CREATE OR REPLACE FUNCTION guard_notification_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sender_id <> OLD.sender_id OR NEW.recipient_id <> OLD.recipient_id
     OR NEW.message <> OLD.message OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Only status fields may be updated';
  END IF;
  IF NEW.status = 'delivered' AND OLD.status = 'sent' THEN
    NEW.delivered_at := NOW();
  ELSIF NEW.status IN ('acknowledged', 'on_my_way') THEN
    NEW.acknowledged_at := NOW();
    NEW.delivered_at := COALESCE(OLD.delivered_at, NOW());
  ELSIF NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Invalid status transition';
  END IF;
  RETURN NEW;
END $$;
