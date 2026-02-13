-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view recipes based on visibility" ON public.recipes;
DROP POLICY IF EXISTS "Group members can view shares" ON public.recipe_group_shares;
DROP POLICY IF EXISTS "Recipe owners can manage shares" ON public.recipe_group_shares;

-- Create a security definer function to check recipe group access without triggering RLS
CREATE OR REPLACE FUNCTION public.user_has_recipe_group_access(_recipe_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipe_group_shares rgs
    JOIN public.group_members gm ON gm.group_id = rgs.group_id
    WHERE rgs.recipe_id = _recipe_id
      AND gm.user_id = _user_id
  )
$$;

-- Recreate recipes SELECT policy using the security definer function
CREATE POLICY "Users can view recipes based on visibility"
ON public.recipes
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    user_id = auth.uid()
    OR visibility = 'public'
    OR (visibility = 'group' AND public.user_has_recipe_group_access(id, auth.uid()))
  )
);

-- Recreate recipe_group_shares policies without referencing recipes table
CREATE POLICY "Group members can view shares"
ON public.recipe_group_shares
FOR SELECT
USING (is_group_member(auth.uid(), group_id));

CREATE POLICY "Recipe owners can manage shares"
ON public.recipe_group_shares
FOR ALL
USING (
  auth.uid() = (SELECT r.user_id FROM public.recipes r WHERE r.id = recipe_id)
);