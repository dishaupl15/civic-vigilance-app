-- Production hardening for authentication, RLS, trigger integrity, and storage.
-- This migration is additive so it is safe to apply after 001-008.

BEGIN;

-- `update_users_updated_at` already exists, but the original users table did
-- not contain the column used by that trigger.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Keep the Auth identity, private user record, and public profile in sync.
-- A public.users row is required because issues.user_id references it.
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  generated_username TEXT := 'Citizen_' || SUBSTRING(REPLACE(NEW.id::TEXT, '-', '') FROM 1 FOR 12);
  supplied_name TEXT := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    ''
  )), '');
BEGIN
  INSERT INTO public.users (id, email, username, display_name, full_name, created_at, updated_at)
  VALUES (NEW.id, NEW.email, generated_username, supplied_name, supplied_name, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = NOW();

  INSERT INTO public.profiles (id, full_name, username, display_name, created_at, updated_at)
  VALUES (NEW.id, supplied_name, generated_username, supplied_name, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        username = COALESCE(public.profiles.username, EXCLUDED.username),
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        updated_at = NOW();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile_for_user() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_user();

-- Backfill Auth users created before the corrected trigger was installed.
INSERT INTO public.users (id, email, username, display_name, full_name, created_at, updated_at)
SELECT
  au.id,
  au.email,
  'Citizen_' || SUBSTRING(REPLACE(au.id::TEXT, '-', '') FROM 1 FOR 12),
  NULLIF(BTRIM(COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', '')), ''),
  NULLIF(BTRIM(COALESCE(au.raw_user_meta_data ->> 'full_name', au.raw_user_meta_data ->> 'name', '')), ''),
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  updated_at = NOW();

INSERT INTO public.profiles (id, full_name, username, display_name, created_at, updated_at)
SELECT
  u.id,
  u.full_name,
  u.username,
  COALESCE(u.display_name, u.full_name),
  u.created_at,
  NOW()
FROM public.users u
ON CONFLICT (id) DO UPDATE SET
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  username = COALESCE(public.profiles.username, EXCLUDED.username),
  display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
  updated_at = NOW();

INSERT INTO public.user_stats (user_id)
SELECT id FROM public.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_preferences (user_id)
SELECT id FROM public.users
ON CONFLICT (user_id) DO NOTHING;

-- Trigger-maintained aggregate tables must never be writable by a client.
DROP POLICY IF EXISTS "System can update user stats" ON public.user_stats;
DROP POLICY IF EXISTS "System can update issue metrics" ON public.issue_metrics;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create pending posts" ON public.pending_twitter_posts;
DROP POLICY IF EXISTS "System can update pending posts" ON public.pending_twitter_posts;

REVOKE INSERT, UPDATE, DELETE ON public.user_stats FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.issue_metrics FROM anon, authenticated;
REVOKE INSERT ON public.notifications FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pending_twitter_posts FROM anon, authenticated;

-- Private identity data (email and home location) is owner-only. Public-facing
-- identity remains available from the narrower profiles table.
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can view own private record"
  ON public.users FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = id);

REVOKE INSERT, UPDATE, DELETE ON public.users FROM anon, authenticated;
GRANT SELECT ON public.users TO authenticated;
CREATE POLICY "Users can update own preferences"
  ON public.users FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = id);
GRANT UPDATE (privacy_default, always_ask_twitter_method, updated_at)
  ON public.users TO authenticated;

-- A user may mark only their own notification as read. Notification content
-- and ownership remain server-controlled.
REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;

-- Reports are immutable evidence after submission. A client may create a
-- pending report but cannot forge moderation or external-posting state.
DROP POLICY IF EXISTS "Authenticated users can create issues" ON public.issues;
CREATE POLICY "Authenticated users can create pending issues"
  ON public.issues FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND moderation_status = 'active'
    AND flagged = false
    AND reviewed = false
    AND tweet_id IS NULL
    AND tweet_url IS NULL
    AND (
      (privacy = 'none' AND visibility = 'private')
      OR (privacy IN ('civic_vigilance', 'personal') AND visibility = 'public')
    )
  );
DROP POLICY IF EXISTS "Users can update own issues" ON public.issues;
REVOKE UPDATE ON public.issues FROM anon, authenticated;

-- Prevent moving a vote or comment between resources during an update.
REVOKE UPDATE ON public.votes FROM anon, authenticated;
GRANT UPDATE (vote) ON public.votes TO authenticated;
REVOKE UPDATE ON public.comments FROM anon, authenticated;
GRANT UPDATE (content, edited, updated_at) ON public.comments TO authenticated;

DROP POLICY IF EXISTS "Users manage own reminders" ON public.follow_up_reminders;
CREATE POLICY "Owners view own reminders"
  ON public.follow_up_reminders FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "Owners create own reminders"
  ON public.follow_up_reminders FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "Owners update own reminders"
  ON public.follow_up_reminders FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "Owners delete own reminders"
  ON public.follow_up_reminders FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners can add citizen issue events" ON public.issue_events;
CREATE POLICY "Owners can add citizen issue events"
  ON public.issue_events FOR INSERT TO authenticated
  WITH CHECK (
    source = 'citizen'
    AND created_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
    )
  );

-- The cached view can include owner-bypassed rows when refreshed, so it is
-- server-only until it is rebuilt with an explicit visibility filter.
REVOKE ALL ON public.trending_issues FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_trending_issues() FROM PUBLIC, anon, authenticated;

-- Make trigger functions explicit security definers now that clients cannot
-- mutate the aggregate tables directly.
CREATE OR REPLACE FUNCTION public.create_user_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.user_stats (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.user_preferences (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_issue_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.issue_metrics (issue_id) VALUES (NEW.id) ON CONFLICT (issue_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_vote_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.issue_metrics
    SET upvotes = upvotes + CASE WHEN NEW.vote = 1 THEN 1 ELSE 0 END,
        downvotes = downvotes + CASE WHEN NEW.vote = -1 THEN 1 ELSE 0 END,
        updated_at = NOW()
    WHERE issue_id = NEW.issue_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.vote IS DISTINCT FROM NEW.vote THEN
    UPDATE public.issue_metrics
    SET upvotes = GREATEST(0, upvotes
          - CASE WHEN OLD.vote = 1 THEN 1 ELSE 0 END
          + CASE WHEN NEW.vote = 1 THEN 1 ELSE 0 END),
        downvotes = GREATEST(0, downvotes
          - CASE WHEN OLD.vote = -1 THEN 1 ELSE 0 END
          + CASE WHEN NEW.vote = -1 THEN 1 ELSE 0 END),
        updated_at = NOW()
    WHERE issue_id = NEW.issue_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.issue_metrics
    SET upvotes = GREATEST(0, upvotes - CASE WHEN OLD.vote = 1 THEN 1 ELSE 0 END),
        downvotes = GREATEST(0, downvotes - CASE WHEN OLD.vote = -1 THEN 1 ELSE 0 END),
        updated_at = NOW()
    WHERE issue_id = OLD.issue_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_stats_on_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_issue_id UUID := CASE WHEN TG_OP = 'DELETE' THEN OLD.issue_id ELSE NEW.issue_id END;
  issue_owner UUID;
BEGIN
  SELECT user_id INTO issue_owner FROM public.issues WHERE id = target_issue_id;

  IF TG_OP = 'INSERT' AND NEW.vote = 1 THEN
    UPDATE public.user_stats SET total_upvotes = total_upvotes + 1, updated_at = NOW()
    WHERE user_id = issue_owner;
  ELSIF TG_OP = 'DELETE' AND OLD.vote = 1 THEN
    UPDATE public.user_stats SET total_upvotes = GREATEST(0, total_upvotes - 1), updated_at = NOW()
    WHERE user_id = issue_owner;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.update_comment_count() SECURITY DEFINER;
ALTER FUNCTION public.update_comment_count() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_stats_on_issue() SECURITY DEFINER;
ALTER FUNCTION public.update_user_stats_on_issue() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_stats_on_comment() SECURITY DEFINER;
ALTER FUNCTION public.update_user_stats_on_comment() SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_user_metadata() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_issue_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_vote_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_user_stats_on_vote() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_comment_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_user_stats_on_issue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_user_stats_on_comment() FROM PUBLIC;

-- Enforce server-side report invariants in addition to client validation.
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_title_max_length;
ALTER TABLE public.issues ADD CONSTRAINT issues_title_max_length
  CHECK (char_length(title) <= 100) NOT VALID;
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_description_length;
ALTER TABLE public.issues ADD CONSTRAINT issues_description_length
  CHECK (description IS NULL OR char_length(description) <= 2000) NOT VALID;
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_photo_count;
ALTER TABLE public.issues ADD CONSTRAINT issues_photo_count
  CHECK (cardinality(photos) BETWEEN 1 AND 3) NOT VALID;
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_confirmed_address;
ALTER TABLE public.issues ADD CONSTRAINT issues_confirmed_address
  CHECK (location_confirmed = false OR NULLIF(BTRIM(address), '') IS NOT NULL) NOT VALID;
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_location_accuracy;
ALTER TABLE public.issues ADD CONSTRAINT issues_location_accuracy
  CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0) NOT VALID;

-- Private reports use a private bucket. Its object path must start with the
-- authenticated user's UUID: {user_id}/issues/{request_id}-{index}.jpg.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'private-issue-photos',
  'private-issue-photos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own private issue photos" ON storage.objects;
CREATE POLICY "Users can read own private issue photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'private-issue-photos'
    AND (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can upload own private issue photos" ON storage.objects;
CREATE POLICY "Users can upload own private issue photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'private-issue-photos'
    AND (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update own private issue photos" ON storage.objects;
CREATE POLICY "Users can update own private issue photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'private-issue-photos'
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'private-issue-photos'
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own private issue photos" ON storage.objects;
CREATE POLICY "Users can delete own private issue photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'private-issue-photos'
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

-- Apply the same ownership requirement to the public report bucket uploads.
DROP POLICY IF EXISTS "Authenticated users can upload issue photos" ON storage.objects;
CREATE POLICY "Users can upload own public issue photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'issue-photos'
    AND (SELECT auth.uid()) IS NOT NULL
    AND (SELECT auth.uid())::TEXT = (storage.foldername(name))[1]
  );

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'issue-photos';

COMMIT;
