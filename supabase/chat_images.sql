-- Photos shared in group chats. Run once in the Supabase SQL editor.
-- Files live at chat-images/<user-id>/<timestamp>.webp and are sent as a message containing
-- the public URL (rendered as an image, like GIFs). Only the owner can upload to their folder.

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own chat images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-images' AND (storage.foldername(name))[1] = auth.uid()::text);
