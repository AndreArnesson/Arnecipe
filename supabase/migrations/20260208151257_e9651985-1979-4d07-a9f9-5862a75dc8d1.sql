-- Add category column to recipes table
ALTER TABLE public.recipes ADD COLUMN category text;

-- Create storage bucket for recipe images
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for recipe images
CREATE POLICY "Anyone can view recipe images"
ON storage.objects FOR SELECT
USING (bucket_id = 'recipe-images');

CREATE POLICY "Authenticated users can upload recipe images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recipe-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own recipe images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'recipe-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own recipe images"
ON storage.objects FOR DELETE
USING (bucket_id = 'recipe-images' AND auth.uid()::text = (storage.foldername(name))[1]);