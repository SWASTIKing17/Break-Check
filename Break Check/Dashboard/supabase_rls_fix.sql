-- ============================================================
-- FreeXan Break Check — Supabase RLS Fix
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New Query
-- Project: toidowlqmqbmtrfjvzgt
-- ============================================================

-- 1. Add UPDATE policy so anon key can update team_profiles
CREATE POLICY "Allow public update"
  ON public.team_profiles
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 2. Add DELETE policy so anon key can delete from team_profiles
CREATE POLICY "Allow public delete"
  ON public.team_profiles
  FOR DELETE
  TO anon
  USING (true);

-- 3. Verify all policies on the table
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'team_profiles';
