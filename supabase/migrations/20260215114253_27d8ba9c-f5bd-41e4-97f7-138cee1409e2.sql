
CREATE TABLE public.recipe_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_comments ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the recipe can see its comments
CREATE POLICY "Users can view comments on visible recipes"
ON public.recipe_comments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.recipes r WHERE r.id = recipe_id
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

CREATE POLICY "Authenticated users can add comments"
ON public.recipe_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
ON public.recipe_comments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON public.recipe_comments FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_recipe_comments_updated_at
BEFORE UPDATE ON public.recipe_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
