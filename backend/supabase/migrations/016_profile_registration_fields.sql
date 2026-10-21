-- Add registration fields to the existing Auth-linked profile table.
-- Apply manually only after reviewing the project's existing migrations/schema.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_first_name_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_first_name_length
      CHECK (first_name IS NULL OR char_length(BTRIM(first_name)) BETWEEN 1 AND 80) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_last_name_length'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_last_name_length
      CHECK (last_name IS NULL OR char_length(BTRIM(last_name)) BETWEEN 1 AND 80) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_phone_number_format'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_phone_number_format
      CHECK (phone_number IS NULL OR phone_number ~ '^\+[1-9][0-9]{7,14}$') NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Backfill names from Auth metadata first, then preserve existing full_name data.
UPDATE public.profiles AS p
SET
  first_name = COALESCE(
    p.first_name,
    NULLIF(BTRIM(au.raw_user_meta_data ->> 'first_name'), ''),
    NULLIF(SPLIT_PART(BTRIM(p.full_name), ' ', 1), '')
  ),
  last_name = COALESCE(
    p.last_name,
    NULLIF(BTRIM(au.raw_user_meta_data ->> 'last_name'), ''),
    CASE
      WHEN POSITION(' ' IN BTRIM(p.full_name)) > 0
      THEN NULLIF(BTRIM(SUBSTRING(BTRIM(p.full_name) FROM POSITION(' ' IN BTRIM(p.full_name)) + 1)), '')
      ELSE NULL
    END
  ),
  phone_number = COALESCE(
    p.phone_number,
    CASE
      WHEN COALESCE(au.raw_user_meta_data ->> 'phone_number', '') ~ '^\+[1-9][0-9]{7,14}$'
      THEN au.raw_user_meta_data ->> 'phone_number'
      ELSE NULL
    END
  ),
  updated_at = NOW()
FROM auth.users AS au
WHERE au.id = p.id
  AND (
    p.first_name IS NULL
    OR p.last_name IS NULL
    OR p.phone_number IS NULL
  );

CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.update_profiles_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_profiles_updated_at() TO authenticated, service_role;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

-- Reuse the existing Auth trigger from migration 009. Keep user-created
-- profiles resilient: invalid/duplicate optional usernames fall back to the
-- stable per-user generated username instead of aborting Auth account creation.
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  generated_username TEXT := 'Citizen_' || SUBSTRING(REPLACE(NEW.id::TEXT, '-', '') FROM 1 FOR 12);
  supplied_username TEXT := NULLIF(LOWER(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'username', ''))), '');
  supplied_first_name TEXT := NULLIF(LEFT(BTRIM(REGEXP_REPLACE(COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''), '[[:cntrl:]]', ' ', 'g')), 80), '');
  supplied_last_name TEXT := NULLIF(LEFT(BTRIM(REGEXP_REPLACE(COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''), '[[:cntrl:]]', ' ', 'g')), 80), '');
  supplied_phone TEXT := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone_number', '')), '');
  supplied_full_name TEXT := NULLIF(LEFT(BTRIM(REGEXP_REPLACE(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''
  ), '[[:cntrl:]]', ' ', 'g')), 161), '');
  profile_username TEXT;
BEGIN
  IF supplied_first_name IS NULL THEN
    supplied_first_name := NULLIF(LEFT(SPLIT_PART(COALESCE(supplied_full_name, ''), ' ', 1), 80), '');
  END IF;
  IF supplied_last_name IS NULL AND supplied_full_name IS NOT NULL
      AND POSITION(' ' IN supplied_full_name) > 0 THEN
    supplied_last_name := NULLIF(LEFT(BTRIM(SUBSTRING(
      supplied_full_name FROM POSITION(' ' IN supplied_full_name) + 1
    )), 80), '');
  END IF;

  supplied_full_name := COALESCE(
    NULLIF(BTRIM(CONCAT_WS(' ', supplied_first_name, supplied_last_name)), ''),
    supplied_full_name
  );

  IF supplied_phone IS NOT NULL AND supplied_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    supplied_phone := NULL;
  END IF;

  IF supplied_username IS NOT NULL THEN
    IF supplied_username !~ '^[a-z0-9_]{3,20}$' THEN
      supplied_username := NULL;
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended(supplied_username, 0));
      IF EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE lower(p.username) = supplied_username AND p.id <> NEW.id
      ) THEN
        supplied_username := NULL;
      END IF;
    END IF;
  END IF;

  profile_username := COALESCE(supplied_username, generated_username);

  INSERT INTO public.users (id, email, username, display_name, full_name, created_at, updated_at)
  VALUES (NEW.id, NEW.email, generated_username, supplied_full_name, supplied_full_name, COALESCE(NEW.created_at, NOW()), NOW())
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.users.full_name, EXCLUDED.full_name),
        display_name = COALESCE(public.users.display_name, EXCLUDED.display_name),
        updated_at = NOW();

  INSERT INTO public.profiles (
    id, first_name, last_name, phone_number, full_name, username, display_name, created_at, updated_at
  )
  VALUES (
    NEW.id, supplied_first_name, supplied_last_name, supplied_phone,
    supplied_full_name, profile_username, supplied_full_name, COALESCE(NEW.created_at, NOW()), NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET first_name = COALESCE(public.profiles.first_name, EXCLUDED.first_name),
        last_name = COALESCE(public.profiles.last_name, EXCLUDED.last_name),
        phone_number = COALESCE(public.profiles.phone_number, EXCLUDED.phone_number),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        username = CASE
          WHEN LEFT(public.profiles.username, 8) = 'Citizen_'
          THEN COALESCE(supplied_username, public.profiles.username)
          ELSE public.profiles.username
        END,
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

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;
DROP POLICY IF EXISTS "profile owners can select own profile" ON public.profiles;
DROP POLICY IF EXISTS "profile owners can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "profile owners can update own profile" ON public.profiles;

CREATE POLICY "profile owners can select own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "profile owners can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "profile owners can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (
  id, first_name, last_name, phone_number, username, avatar_url, full_name,
  bio, city, state, anonymous_mode, display_name
) ON public.profiles TO authenticated;
GRANT UPDATE (
  first_name, last_name, phone_number, username, avatar_url, full_name,
  bio, city, state, anonymous_mode, display_name
) ON public.profiles TO authenticated;

COMMENT ON COLUMN public.profiles.first_name IS 'Private profile first name; readable by the profile owner only.';
COMMENT ON COLUMN public.profiles.last_name IS 'Private profile last name; readable by the profile owner only.';
COMMENT ON COLUMN public.profiles.phone_number IS 'Optional E.164 phone number; readable by the profile owner only.';

COMMIT;