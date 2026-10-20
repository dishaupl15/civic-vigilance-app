-- Persist reviewed report suggestions and AI writing drafts for their owner.
-- Apply after migrations 008, 009, and 010_issue_location_integrity.sql.

BEGIN;

CREATE TABLE public.issue_authority_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authority_id UUID NOT NULL REFERENCES public.authorities(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(BTRIM(display_name)) BETWEEN 1 AND 200),
  public_handle TEXT NOT NULL CHECK (public_handle ~ '^@[A-Za-z0-9_]{1,15}$'),
  profile_url TEXT CHECK (profile_url IS NULL OR profile_url ~ '^https://'),
  category issue_category NOT NULL,
  relevance_reason TEXT NOT NULL CHECK (char_length(BTRIM(relevance_reason)) BETWEEN 1 AND 300),
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https://'),
  last_verified_at TIMESTAMPTZ,
  verification_status TEXT NOT NULL CHECK (verification_status = 'verified'),
  selected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, public_handle)
);

CREATE INDEX idx_issue_authority_suggestions_owner
  ON public.issue_authority_suggestions(user_id, issue_id);
CREATE UNIQUE INDEX idx_issue_authority_suggestions_issue_handle_ci
  ON public.issue_authority_suggestions(issue_id, LOWER(public_handle));

ALTER TABLE public.issue_authority_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.issue_authority_suggestions FROM anon, authenticated;
GRANT SELECT, INSERT ON public.issue_authority_suggestions TO authenticated;

CREATE POLICY "Owners read issue authority suggestions"
  ON public.issue_authority_suggestions FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Owners save issue authority suggestions"
  ON public.issue_authority_suggestions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
        AND i.category = issue_authority_suggestions.category
    )
    AND EXISTS (
      SELECT 1
      FROM public.authorities a
      WHERE a.id = authority_id
        AND a.name = issue_authority_suggestions.display_name
        AND a.status = 'active'
        AND a.verification_status = 'verified'
        AND a.social_media #>> '{twitter,handle}' = public_handle
        AND a.social_media #>> '{twitter,verified}' = 'true'
        AND a.social_media #>> '{twitter,active}' IS DISTINCT FROM 'false'
    )
  );

CREATE TABLE public.issue_generated_content (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL,
  category issue_category NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type = 'report_draft'),
  generated_content JSONB NOT NULL CHECK (jsonb_typeof(generated_content) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (issue_id, generation_id)
);

CREATE INDEX idx_issue_generated_content_owner
  ON public.issue_generated_content(user_id, issue_id, created_at DESC);

ALTER TABLE public.issue_generated_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.issue_generated_content FROM anon, authenticated;
GRANT SELECT, INSERT ON public.issue_generated_content TO authenticated;

CREATE POLICY "Owners read issue generated content"
  ON public.issue_generated_content FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
        AND i.category = issue_generated_content.category
    )
  );

CREATE POLICY "Owners save issue generated content"
  ON public.issue_generated_content FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_id AND i.user_id = (SELECT auth.uid())
    )
  );

COMMIT;
