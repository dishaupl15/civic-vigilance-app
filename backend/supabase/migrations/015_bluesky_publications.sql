CREATE TABLE IF NOT EXISTS public.bluesky_publications (
  report_id UUID PRIMARY KEY REFERENCES public.issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('publishing', 'published', 'failed', 'uncertain')),
  post_uri TEXT UNIQUE,
  post_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bluesky_publication_result CHECK (
    (status = 'published' AND post_uri IS NOT NULL AND post_url IS NOT NULL)
    OR (status <> 'published' AND post_uri IS NULL AND post_url IS NULL)
  )
);

ALTER TABLE public.bluesky_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bluesky_publications FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.bluesky_publications TO service_role;
