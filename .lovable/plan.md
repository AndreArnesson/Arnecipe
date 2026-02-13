
# Fix: Group Invites 403 Error

## Problem
Every query to the `group_invites` table returns a **403 "permission denied for table users"** error. This is because the RLS SELECT policy references `auth.users` directly in a subquery:

```sql
invited_email = (SELECT users.email FROM auth.users WHERE users.id = auth.uid())
```

The `authenticated` role does not have SELECT access to the `auth.users` table, so the policy evaluation itself fails.

## Solution

### 1. Database Migration
Replace the RLS policies on `group_invites` that reference `auth.users` with ones using `auth.email()` (a built-in function that works without table access):

- **SELECT policy** ("Group members can view invites"): Change the subquery to `auth.email()`
- **UPDATE policy** ("Invited user can update invite status"): Same fix

```sql
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
```

### 2. Add Pending Invite Banner on Main Page
Show a notification banner on the recipe dashboard (`Index.tsx`) when the user has pending group invites, so they don't have to manually navigate to `/groups`.

## Technical Details

- `auth.email()` is a Supabase built-in that returns the authenticated user's email without querying the `auth.users` table
- No code changes needed for the fix itself -- only the database migration
- The banner on the main page will query `group_invites` for pending invites and show a dismissible notification linking to `/groups`
