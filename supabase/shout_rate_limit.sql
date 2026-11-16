-- Server-side shout rate limit: a sender may start a new shout at most once every 5 seconds.
-- Rows sharing a batch_id (one group shout = many rows) are allowed; only a NEW batch is checked.
-- Run once in the Supabase SQL editor (after schema.sql and chat_batches.sql).

CREATE OR REPLACE FUNCTION limit_shout_rate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Developers are exempt so the Dev panel's test shout card is not rate limited.
  IF current_role_of_user() = 'developer' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE sender_id = NEW.sender_id
      AND batch_id IS DISTINCT FROM NEW.batch_id
      AND created_at > NOW() - INTERVAL '5 seconds'
  ) THEN
    RAISE EXCEPTION 'Spam Detected'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shout_rate_limit ON notifications;
CREATE TRIGGER shout_rate_limit BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION limit_shout_rate();
