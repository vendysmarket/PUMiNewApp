-- Add DELETE policy to user_profiles table
-- This explicitly denies profile deletion to prevent accidental data loss
-- Users should not be able to delete their profile data directly

CREATE POLICY "Users cannot delete profiles"
ON public.user_profiles
FOR DELETE
TO authenticated
USING (false);