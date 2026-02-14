
-- Create a SECURITY DEFINER function to check if a recipe has a share token
CREATE OR REPLACE FUNCTION public.recipe_has_share_token(_recipe_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipe_shares
    WHERE recipe_id = _recipe_id
  )
$$;

-- Update the recipes SELECT policy to also allow access for shared recipes
DROP POLICY IF EXISTS "Users can view recipes based on visibility" ON public.recipes;
CREATE POLICY "Users can view recipes based on visibility"
ON public.recipes FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'group' AND user_has_recipe_group_access(id, auth.uid()))
  ))
  OR recipe_has_share_token(id)
);

-- Allow anon to read recipe_shares for token lookup
DROP POLICY IF EXISTS "Authenticated users can view shares" ON public.recipe_shares;
CREATE POLICY "Anyone can view shares"
ON public.recipe_shares FOR SELECT
USING (true);

-- Allow anon to read profiles for shared recipes
-- profiles already has "Users can view all profiles" with USING (true), so this is fine

-- Allow anon to read ratings for shared recipes  
DROP POLICY IF EXISTS "Users can view ratings" ON public.recipe_ratings;
CREATE POLICY "Users can view ratings"
ON public.recipe_ratings FOR SELECT
USING (true);
