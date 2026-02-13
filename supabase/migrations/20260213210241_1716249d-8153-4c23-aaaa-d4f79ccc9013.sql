
-- Drop and recreate SELECT policy
DROP POLICY "Group members can view invites" ON public.group_invites;
CREATE POLICY "Group members can view invites"
  ON public.group_invites FOR SELECT
  TO authenticated
  USING (
    is_group_member(auth.uid(), group_id)
    OR invited_email = auth.email()
  );

-- Drop and recreate UPDATE policy
DROP POLICY "Invited user can update invite status" ON public.group_invites;
CREATE POLICY "Invited user can update invite status"
  ON public.group_invites FOR UPDATE
  TO authenticated
  USING (invited_email = auth.email());
