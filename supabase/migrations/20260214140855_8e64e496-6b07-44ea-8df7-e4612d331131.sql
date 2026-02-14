
-- Allow the current owner to update user_id (transfer ownership)
-- The existing policy checks auth.uid() = user_id on the OLD row, which is correct.
-- But we also need to ensure the WITH CHECK allows the new user_id.
DROP POLICY IF EXISTS "Users can update their own recipes" ON public.recipes;
CREATE POLICY "Users can update their own recipes"
ON public.recipes FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (true);
