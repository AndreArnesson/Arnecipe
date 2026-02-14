
-- Create recipe_ratings table for per-user ratings (1-5, half steps)
CREATE TABLE public.recipe_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5 AND (rating * 2) = FLOOR(rating * 2)),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, user_id)
);

-- Enable RLS
ALTER TABLE public.recipe_ratings ENABLE ROW LEVEL SECURITY;

-- Users can view ratings for recipes they can see
CREATE POLICY "Users can view ratings"
ON public.recipe_ratings FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can insert their own ratings
CREATE POLICY "Users can insert own ratings"
ON public.recipe_ratings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own ratings
CREATE POLICY "Users can update own ratings"
ON public.recipe_ratings FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own ratings
CREATE POLICY "Users can delete own ratings"
ON public.recipe_ratings FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_recipe_ratings_updated_at
BEFORE UPDATE ON public.recipe_ratings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Remove old text-based rating column from recipes
ALTER TABLE public.recipes DROP COLUMN IF EXISTS rating;
