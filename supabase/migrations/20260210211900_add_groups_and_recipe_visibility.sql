-- Create groups table
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Create group_members table
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Enable RLS on group_members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Create group_invites table
CREATE TABLE public.group_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, invited_email, status)
);

-- Enable RLS on group_invites
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;

-- Add visibility column to recipes (default 'group' for backward compatibility with family sharing)
ALTER TABLE public.recipes ADD COLUMN visibility TEXT NOT NULL DEFAULT 'group' CHECK (visibility IN ('private', 'group', 'public'));

-- Create recipe_group_shares table for sharing recipes with specific groups
CREATE TABLE public.recipe_group_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  UNIQUE(recipe_id, group_id)
);

-- Enable RLS on recipe_group_shares
ALTER TABLE public.recipe_group_shares ENABLE ROW LEVEL SECURITY;

-- Groups policies: members can view their groups
CREATE POLICY "Group members can view their groups"
ON public.groups FOR SELECT
USING (
  id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
);

CREATE POLICY "Authenticated users can create groups"
ON public.groups FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group owners can update their groups"
ON public.groups FOR UPDATE
USING (
  id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'owner')
);

CREATE POLICY "Group owners can delete their groups"
ON public.groups FOR DELETE
USING (
  id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'owner')
);

-- Group members policies
CREATE POLICY "Group members can view other members"
ON public.group_members FOR SELECT
USING (
  group_id IN (SELECT group_id FROM public.group_members AS gm WHERE gm.user_id = auth.uid())
);

CREATE POLICY "Group owners can add members"
ON public.group_members FOR INSERT
WITH CHECK (
  group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'owner')
  OR user_id = auth.uid()
);

CREATE POLICY "Group owners can remove members"
ON public.group_members FOR DELETE
USING (
  group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'owner')
  OR user_id = auth.uid()
);

-- Group invites policies
CREATE POLICY "Group members can view invites for their groups"
ON public.group_invites FOR SELECT
USING (
  group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  OR invited_email IN (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Group owners can create invites"
ON public.group_invites FOR INSERT
WITH CHECK (
  group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'owner')
);

CREATE POLICY "Invited users and owners can update invites"
ON public.group_invites FOR UPDATE
USING (
  invited_email IN (SELECT email FROM auth.users WHERE id = auth.uid())
  OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'owner')
);

CREATE POLICY "Group owners can delete invites"
ON public.group_invites FOR DELETE
USING (
  group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'owner')
);

-- Recipe group shares policies
CREATE POLICY "Group members can view recipe shares"
ON public.recipe_group_shares FOR SELECT
USING (
  group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
);

CREATE POLICY "Recipe owners can share recipes"
ON public.recipe_group_shares FOR INSERT
WITH CHECK (
  recipe_id IN (SELECT id FROM public.recipes WHERE user_id = auth.uid())
);

CREATE POLICY "Recipe owners can remove shares"
ON public.recipe_group_shares FOR DELETE
USING (
  recipe_id IN (SELECT id FROM public.recipes WHERE user_id = auth.uid())
);

-- Update recipe select policy to consider visibility
DROP POLICY "All authenticated users can view recipes" ON public.recipes;

CREATE POLICY "Users can view recipes based on visibility"
ON public.recipes FOR SELECT
USING (
  auth.uid() IS NOT NULL AND (
    -- User can always see their own recipes
    user_id = auth.uid()
    -- Public recipes are visible to everyone
    OR visibility = 'public'
    -- Group recipes visible to group members
    OR (visibility = 'group' AND id IN (
      SELECT rgs.recipe_id FROM public.recipe_group_shares rgs
      WHERE rgs.group_id IN (
        SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid()
      )
    ))
  )
);

-- Add timestamp triggers for new tables
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
