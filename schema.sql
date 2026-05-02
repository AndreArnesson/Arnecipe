-- Complete idempotent schema for arnesson-recipe
-- Tables first, then functions (SQL functions validate table references at creation time)

-- ─── TABLES ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  ingredients TEXT[] NOT NULL DEFAULT '{}',
  instructions TEXT[] NOT NULL DEFAULT '{}',
  prep_time INTEGER,
  cook_time INTEGER,
  servings INTEGER,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'group';
ALTER TABLE public.recipes DROP COLUMN IF EXISTS rating;

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.group_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_invite
  ON public.group_invites (group_id, invited_email) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.recipe_group_shares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  UNIQUE(recipe_id, group_id)
);

CREATE TABLE IF NOT EXISTS public.recipe_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5 AND (rating * 2) = FLOOR(rating * 2)),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.recipe_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  share_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipe_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recipe_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ─── FUNCTIONS ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_group_member(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = _user_id AND group_id = _group_id
  )
$$;

CREATE OR REPLACE FUNCTION public.user_has_recipe_group_access(_recipe_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.recipe_group_shares rgs
    JOIN public.group_members gm ON gm.group_id = rgs.group_id
    WHERE rgs.recipe_id = _recipe_id AND gm.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.recipe_has_share_token(_recipe_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.recipe_shares WHERE recipe_id = _recipe_id
  )
$$;

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_group_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_images ENABLE ROW LEVEL SECURITY;

-- ─── POLICIES ─────────────────────────────────────────────────────────────────

-- profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- recipes
DROP POLICY IF EXISTS "All authenticated users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users can view recipes based on visibility" ON public.recipes;
CREATE POLICY "Users can view recipes based on visibility" ON public.recipes FOR SELECT
USING (
  (auth.uid() IS NOT NULL AND (
    user_id = auth.uid() OR visibility = 'public'
    OR (visibility = 'group' AND user_has_recipe_group_access(id, auth.uid()))
  )) OR recipe_has_share_token(id)
);
DROP POLICY IF EXISTS "Users can create their own recipes" ON public.recipes;
CREATE POLICY "Users can create their own recipes" ON public.recipes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update their own recipes" ON public.recipes;
CREATE POLICY "Users can update their own recipes" ON public.recipes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (true);
DROP POLICY IF EXISTS "Users can delete their own recipes" ON public.recipes;
CREATE POLICY "Users can delete their own recipes" ON public.recipes FOR DELETE USING (auth.uid() = user_id);

-- groups
DROP POLICY IF EXISTS "Members can view their groups" ON public.groups;
DROP POLICY IF EXISTS "Group members can view their groups" ON public.groups;
CREATE POLICY "Members can view their groups" ON public.groups FOR SELECT
USING (EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()) OR auth.uid() = created_by);
DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
CREATE POLICY "Authenticated users can create groups" ON public.groups FOR INSERT WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "Owner can update group" ON public.groups;
DROP POLICY IF EXISTS "Group owners can update their groups" ON public.groups;
CREATE POLICY "Owner can update group" ON public.groups FOR UPDATE USING (auth.uid() = created_by);
DROP POLICY IF EXISTS "Owner can delete group" ON public.groups;
DROP POLICY IF EXISTS "Group owners can delete their groups" ON public.groups;
CREATE POLICY "Owner can delete group" ON public.groups FOR DELETE USING (auth.uid() = created_by);

-- group_members
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Group members can view other members" ON public.group_members;
CREATE POLICY "Members can view group members" ON public.group_members FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
DROP POLICY IF EXISTS "Users can insert themselves as members" ON public.group_members;
DROP POLICY IF EXISTS "Group owners can add members" ON public.group_members;
CREATE POLICY "Users can insert themselves as members" ON public.group_members FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can remove themselves" ON public.group_members;
DROP POLICY IF EXISTS "Group owners can remove members" ON public.group_members;
CREATE POLICY "Users can remove themselves" ON public.group_members FOR DELETE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners can update member roles" ON public.group_members;
CREATE POLICY "Owners can update member roles" ON public.group_members FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.group_members owner_check WHERE owner_check.group_id = group_members.group_id AND owner_check.user_id = auth.uid() AND owner_check.role = 'owner'));

-- group_invites
DROP POLICY IF EXISTS "Group members can view invites" ON public.group_invites;
DROP POLICY IF EXISTS "Group members can view invites for their groups" ON public.group_invites;
CREATE POLICY "Group members can view invites" ON public.group_invites FOR SELECT TO authenticated
USING (public.is_group_member(auth.uid(), group_id) OR invited_email = auth.email());
DROP POLICY IF EXISTS "Group members can create invites" ON public.group_invites;
DROP POLICY IF EXISTS "Group owners can create invites" ON public.group_invites;
CREATE POLICY "Group members can create invites" ON public.group_invites FOR INSERT WITH CHECK (public.is_group_member(auth.uid(), group_id));
DROP POLICY IF EXISTS "Invited user can update invite status" ON public.group_invites;
DROP POLICY IF EXISTS "Invited users and owners can update invites" ON public.group_invites;
CREATE POLICY "Invited user can update invite status" ON public.group_invites FOR UPDATE TO authenticated USING (invited_email = auth.email());

-- recipe_group_shares
DROP POLICY IF EXISTS "Group members can view shares" ON public.recipe_group_shares;
CREATE POLICY "Group members can view shares" ON public.recipe_group_shares FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
DROP POLICY IF EXISTS "Recipe owners can manage shares" ON public.recipe_group_shares;
CREATE POLICY "Recipe owners can manage shares" ON public.recipe_group_shares FOR ALL
USING (auth.uid() = (SELECT r.user_id FROM public.recipes r WHERE r.id = recipe_id));

-- recipe_ratings
DROP POLICY IF EXISTS "Users can view ratings" ON public.recipe_ratings;
CREATE POLICY "Users can view ratings" ON public.recipe_ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert own ratings" ON public.recipe_ratings;
CREATE POLICY "Users can insert own ratings" ON public.recipe_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ratings" ON public.recipe_ratings;
CREATE POLICY "Users can update own ratings" ON public.recipe_ratings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own ratings" ON public.recipe_ratings;
CREATE POLICY "Users can delete own ratings" ON public.recipe_ratings FOR DELETE USING (auth.uid() = user_id);

-- recipe_shares
DROP POLICY IF EXISTS "Anyone can view shares" ON public.recipe_shares;
DROP POLICY IF EXISTS "Authenticated users can view shares" ON public.recipe_shares;
CREATE POLICY "Anyone can view shares" ON public.recipe_shares FOR SELECT USING (true);
DROP POLICY IF EXISTS "Recipe owners can manage shares" ON public.recipe_shares;
CREATE POLICY "Recipe owners can manage shares" ON public.recipe_shares FOR ALL USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- recipe_comments
DROP POLICY IF EXISTS "Users can view comments on visible recipes" ON public.recipe_comments;
CREATE POLICY "Users can view comments on visible recipes" ON public.recipe_comments FOR SELECT
USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND (
  (auth.uid() IS NOT NULL AND (r.user_id = auth.uid() OR r.visibility = 'public' OR (r.visibility = 'group' AND user_has_recipe_group_access(r.id, auth.uid()))))
  OR recipe_has_share_token(r.id)
)));
DROP POLICY IF EXISTS "Authenticated users can add comments" ON public.recipe_comments;
CREATE POLICY "Authenticated users can add comments" ON public.recipe_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own comments" ON public.recipe_comments;
CREATE POLICY "Users can update own comments" ON public.recipe_comments FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own comments" ON public.recipe_comments;
CREATE POLICY "Users can delete own comments" ON public.recipe_comments FOR DELETE USING (auth.uid() = user_id);

-- recipe_images
DROP POLICY IF EXISTS "Users can view images on visible recipes" ON public.recipe_images;
CREATE POLICY "Users can view images on visible recipes" ON public.recipe_images FOR SELECT
USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_images.recipe_id AND (
  (auth.uid() IS NOT NULL AND (r.user_id = auth.uid() OR r.visibility = 'public' OR (r.visibility = 'group' AND user_has_recipe_group_access(r.id, auth.uid()))))
  OR recipe_has_share_token(r.id)
)));
DROP POLICY IF EXISTS "Recipe owners can add images" ON public.recipe_images;
CREATE POLICY "Recipe owners can add images" ON public.recipe_images FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_images.recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Recipe owners can update images" ON public.recipe_images;
CREATE POLICY "Recipe owners can update images" ON public.recipe_images FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_images.recipe_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS "Recipe owners can delete images" ON public.recipe_images;
CREATE POLICY "Recipe owners can delete images" ON public.recipe_images FOR DELETE
USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_images.recipe_id AND r.user_id = auth.uid()));

-- storage
DROP POLICY IF EXISTS "Anyone can view recipe images" ON storage.objects;
CREATE POLICY "Anyone can view recipe images" ON storage.objects FOR SELECT USING (bucket_id = 'recipe-images');
DROP POLICY IF EXISTS "Authenticated users can upload recipe images" ON storage.objects;
CREATE POLICY "Authenticated users can upload recipe images" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'recipe-images' AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Users can update their own recipe images" ON storage.objects;
CREATE POLICY "Users can update their own recipe images" ON storage.objects FOR UPDATE
USING (bucket_id = 'recipe-images' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can delete their own recipe images" ON storage.objects;
CREATE POLICY "Users can delete their own recipe images" ON storage.objects FOR DELETE
USING (bucket_id = 'recipe-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ─── TRIGGERS ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_recipes_updated_at ON public.recipes;
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_groups_updated_at ON public.groups;
CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_recipe_ratings_updated_at ON public.recipe_ratings;
CREATE TRIGGER update_recipe_ratings_updated_at
  BEFORE UPDATE ON public.recipe_ratings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_recipe_comments_updated_at ON public.recipe_comments;
CREATE TRIGGER update_recipe_comments_updated_at
  BEFORE UPDATE ON public.recipe_comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── STORAGE BUCKET ───────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;
