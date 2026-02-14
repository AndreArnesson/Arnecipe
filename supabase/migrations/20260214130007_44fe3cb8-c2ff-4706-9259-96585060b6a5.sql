
CREATE TABLE public.recipe_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  share_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recipe_shares ENABLE ROW LEVEL SECURITY;

-- Recipe owners can manage their shares
CREATE POLICY "Recipe owners can manage shares"
ON public.recipe_shares FOR ALL
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Authenticated users can view shares (needed for looking up share tokens)
CREATE POLICY "Authenticated users can view shares"
ON public.recipe_shares FOR SELECT
USING (auth.uid() IS NOT NULL);
