/*
  # Harden community pattern RLS (pre-open-source security fix)

  1. Problem
    The anon UPDATE and DELETE policies added in
    20260224174454_add_community_patterns_and_nullable_user.sql were scoped only
    by `user_id IS NULL`, which matches EVERY anonymously-created community row —
    not just the caller's own. Because the client ships only the public anon key,
    any anonymous visitor could overwrite (deface) or delete every shared
    community pattern. This is the classic "anon = shared identity" RLS mistake.

  2. Fix
    The app only ever SELECTs community rows and INSERTs new shares (see
    PartSourcePanel.handleShareSavedPattern and PlayerMode) — it never updates or
    deletes them — so the anon UPDATE/DELETE policies can be removed with zero
    loss of functionality. Community rows become read + insert only for anon.
    Removal or moderation of shared content must be done with a privileged
    (service-role) key or a future authenticated flow.

  3. Also tightened
    The anon INSERT policy is re-scoped so anonymous rows must be genuine
    community shares (`is_community = true`) with bounded text/JSON, as a basic
    defence against defacement/flooding. Bounds are generous to avoid rejecting
    legitimate large patterns. Self-hosters enabling Supabase should still add
    server-side rate limiting / moderation.

  4. Notes
    Authenticated-user policies are unchanged. All statements are idempotent
    (DROP ... IF EXISTS) so this migration is safe to re-run.
*/

-- Remove the over-broad anon write policies (any anon could modify any anon row).
DROP POLICY IF EXISTS "Anon can update own anonymous patterns" ON patterns;
DROP POLICY IF EXISTS "Anon can delete own anonymous patterns" ON patterns;

-- Re-scope anon INSERT: anonymous rows must be community shares with sane,
-- bounded fields so they can't be used to flood or deface the shared library.
DROP POLICY IF EXISTS "Anon can insert patterns without user_id" ON patterns;
DROP POLICY IF EXISTS "Anon can share community patterns" ON patterns;
CREATE POLICY "Anon can share community patterns"
  ON patterns FOR INSERT
  TO anon
  WITH CHECK (
    user_id IS NULL
    AND is_community = true
    AND char_length(name) <= 200
    AND char_length(description) <= 2000
    AND pg_column_size(pattern_data) <= 32768
  );
