-- Add parent_id to recipe_comments for threaded replies
ALTER TABLE public.recipe_comments
  ADD COLUMN parent_id UUID REFERENCES public.recipe_comments(id) ON DELETE CASCADE;

-- Notifications table
CREATE TABLE public.notifications (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL,
  actor_id    UUID NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('new_recipe', 'comment_on_recipe', 'reply_to_comment')),
  recipe_id   UUID REFERENCES public.recipes(id) ON DELETE CASCADE,
  comment_id  UUID REFERENCES public.recipe_comments(id) ON DELETE CASCADE,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

-- Authenticated users can insert notifications (needed to notify others)
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- Index for fast per-user lookups
CREATE INDEX notifications_user_id_idx ON public.notifications (user_id, created_at DESC);
