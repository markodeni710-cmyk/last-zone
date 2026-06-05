
-- Create public clips storage bucket for video uploads and thumbnails
INSERT INTO storage.buckets (id, name, public) VALUES ('clips', 'clips', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view clip files
CREATE POLICY "Clip files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'clips');

-- Authenticated users can upload their own clip files (under their user id folder)
CREATE POLICY "Users can upload their own clip files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own clip files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own clip files"
ON storage.objects FOR DELETE
USING (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);
