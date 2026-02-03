-- Create the storage bucket 'treasure-hunt' if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('treasure-hunt', 'treasure-hunt', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all objects in the 'treasure-hunt' bucket
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'treasure-hunt' );

-- Allow authenticated users to upload files to the 'treasure-hunt' bucket
CREATE POLICY "Authenticated Upload Access"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'treasure-hunt' 
  AND auth.role() = 'authenticated'
);

-- Allow users to update/delete their own files (optional, good for editing)
CREATE POLICY "User Update Access"
ON storage.objects FOR UPDATE
USING ( auth.uid() = owner )
WITH CHECK ( bucket_id = 'treasure-hunt' );

CREATE POLICY "User Delete Access"
ON storage.objects FOR DELETE
USING ( auth.uid() = owner AND bucket_id = 'treasure-hunt' );
