
CREATE TABLE public.recipe_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_images ENABLE ROW LEVEL SECURITY;

-- View: same as recipe visibility
CREATE POLICY "Users can view images on visible recipes"
ON public.recipe_images
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_images.recipe_id
    AND (
      (auth.uid() IS NOT NULL AND (
        r.user_id = auth.uid()
        OR r.visibility = 'public'
        OR (r.visibility = 'group' AND user_has_recipe_group_access(r.id, auth.uid()))
      ))
      OR recipe_has_share_token(r.id)
    )
  )
);

-- Insert: recipe owner only
CREATE POLICY "Recipe owners can add images"
ON public.recipe_images
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_images.recipe_id
    AND r.user_id = auth.uid()
  )
);

-- Update: recipe owner only
CREATE POLICY "Recipe owners can update images"
ON public.recipe_images
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_images.recipe_id
    AND r.user_id = auth.uid()
  )
);

-- Delete: recipe owner only
CREATE POLICY "Recipe owners can delete images"
ON public.recipe_images
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.recipes r
    WHERE r.id = recipe_images.recipe_id
    AND r.user_id = auth.uid()
  )
);
