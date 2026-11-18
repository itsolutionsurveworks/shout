-- Weekly cleanup of group chat photos. Run once in the Supabase SQL editor (after chat_images.sql).
-- Every Friday at 11:59 PM Philippine time (UTC+8 = 15:59 UTC) all files in the chat-images
-- bucket are deleted to free space. Chat bubbles whose photo is gone show a "photo cleared" notice.
-- Re-running is safe: the old job is unscheduled first.

-- pg_cron must be enabled in the Supabase dashboard (Database > Extensions) if this line fails.
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION clear_chat_images() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  -- Supabase blocks direct DELETEs on storage.objects unless this flag is set for the transaction.
  PERFORM set_config('storage.allow_delete_query', 'true', true);
  DELETE FROM storage.objects WHERE bucket_id = 'chat-images';
END $$;

-- pg_cron runs in UTC. 15:59 UTC on Fridays = 11:59 PM Friday in the Philippines.
SELECT cron.unschedule('clear-chat-images')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clear-chat-images');

SELECT cron.schedule('clear-chat-images', '59 15 * * 5', $$SELECT clear_chat_images();$$);
