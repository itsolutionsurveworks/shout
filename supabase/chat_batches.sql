-- Group shouts become ONE message with many per-recipient receipts (like WhatsApp group "Info").
-- Run once in the Supabase SQL editor (after schema.sql and quick_shouts.sql).

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS batch_id UUID,
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notifications_sender_idx ON notifications (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_batch_idx ON notifications (batch_id);

-- Guard also locking the new columns against recipient edits.
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
