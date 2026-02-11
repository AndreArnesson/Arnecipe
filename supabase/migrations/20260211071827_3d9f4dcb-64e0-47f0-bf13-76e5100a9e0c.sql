
-- Create groups table
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group_members table
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create group_invites table
CREATE TABLE public.group_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create recipe_group_shares table
CREATE TABLE public.recipe_group_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  UNIQUE(recipe_id, group_id)
);

-- Add visibility and rating columns to recipes
ALTER TABLE public.recipes ADD COLUMN visibility TEXT NOT NULL DEFAULT 'group';
ALTER TABLE public.recipes ADD COLUMN rating TEXT;

-- RLS for groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can create groups"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Members can view their groups"
  ON public.groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()
    )
    OR auth.uid() = created_by
  );

CREATE POLICY "Owner can update group"
  ON public.groups FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Owner can delete group"
  ON public.groups FOR DELETE
  USING (auth.uid() = created_by);

-- Security definer function to avoid infinite recursion on group_members
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id
  )
$$;

-- RLS for group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view group members"
  ON public.group_members FOR SELECT
  USING (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Users can insert themselves as members"
  ON public.group_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove themselves"
  ON public.group_members FOR DELETE
  USING (auth.uid() = user_id);

-- RLS for group_invites
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view invites"
  ON public.group_invites FOR SELECT
  USING (
    public.is_group_member(auth.uid(), group_id)
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Group members can create invites"
  ON public.group_invites FOR INSERT
  WITH CHECK (public.is_group_member(auth.uid(), group_id));

CREATE POLICY "Invited user can update invite status"
  ON public.group_invites FOR UPDATE
  USING (
    invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- RLS for recipe_group_shares
ALTER TABLE public.recipe_group_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipe owners can manage shares"
  ON public.recipe_group_shares FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id = recipe_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can view shares"
  ON public.recipe_group_shares FOR SELECT
  USING (public.is_group_member(auth.uid(), group_id));

-- Update recipes RLS for visibility
DROP POLICY IF EXISTS "All authenticated users can view recipes" ON public.recipes;

CREATE POLICY "Users can view recipes based on visibility"
  ON public.recipes FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid()
      OR visibility = 'public'
      OR (
        visibility = 'group' AND EXISTS (
          SELECT 1 FROM public.recipe_group_shares rgs
          JOIN public.group_members gm ON gm.group_id = rgs.group_id
          WHERE rgs.recipe_id = recipes.id AND gm.user_id = auth.uid()
        )
      )
    )
  );
