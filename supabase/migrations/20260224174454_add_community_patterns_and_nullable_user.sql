/*
  # Add community patterns support and make user_id nullable

  1. Modified Tables
    - `patterns`
      - `user_id` changed from NOT NULL to nullable (allows anonymous saves before auth is implemented)
      - `is_community` (boolean) - whether this pattern is shared publicly in the community library
      - `pattern_id` (smallint) - the Vibe protocol pattern ID (0-255)

  2. Security Changes
    - Added anon read policy for community patterns (is_community = true)
    - Added anon insert policy for patterns with null user_id
    - Added anon update/delete policies for patterns with null user_id
    - Existing authenticated user policies remain unchanged

  3. Notes
    - Community patterns are readable by anyone (anon or authenticated)
    - Anonymous users can only modify patterns where user_id IS NULL
    - Future: when auth is added, anonymous patterns can be claimed by users
*/

ALTER TABLE patterns ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patterns' AND column_name = 'is_community'
  ) THEN
    ALTER TABLE patterns ADD COLUMN is_community boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patterns' AND column_name = 'pattern_id'
  ) THEN
    ALTER TABLE patterns ADD COLUMN pattern_id smallint NOT NULL DEFAULT 1;
  END IF;
END $$;

CREATE POLICY "Anyone can read community patterns"
  ON patterns FOR SELECT
  TO anon
  USING (is_community = true);

CREATE POLICY "Anon can insert patterns without user_id"
  ON patterns FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Anon can update own anonymous patterns"
  ON patterns FOR UPDATE
  TO anon
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Anon can delete own anonymous patterns"
  ON patterns FOR DELETE
  TO anon
  USING (user_id IS NULL);

CREATE POLICY "Authenticated can read community patterns"
  ON patterns FOR SELECT
  TO authenticated
  USING (is_community = true OR auth.uid() = user_id);
