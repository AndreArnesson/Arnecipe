-- Allow owners to update roles of members in their group
CREATE POLICY "Owners can update member roles"
ON public.group_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.group_members owner_check
    WHERE owner_check.group_id = group_members.group_id
      AND owner_check.user_id = auth.uid()
      AND owner_check.role = 'owner'
  )
);