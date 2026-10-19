-- Reporting reliability, provenance and follow-up lifecycle.
-- Apply after 001-007. This migration is additive and does not fabricate external status.

ALTER TABLE public.issues ALTER COLUMN location DROP NOT NULL;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS client_request_id UUID;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS location_accuracy_m DOUBLE PRECISION;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS location_source TEXT
  CHECK (location_source IN ('gps', 'manual'));
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS location_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'private'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_user_request
  ON public.issues(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

DROP POLICY IF EXISTS "Users can update own photos" ON storage.objects;
CREATE POLICY "Users can update own photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'issue-photos' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'issue-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

ALTER TABLE public.authorities ADD COLUMN IF NOT EXISTS complaint_portal_url TEXT;
ALTER TABLE public.authorities ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.authorities ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE public.authorities ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'seed'
  CHECK (verification_status IN ('verified', 'seed', 'expired', 'rejected'));
ALTER TABLE public.authorities ADD COLUMN IF NOT EXISTS routing_exceptions TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.issue_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('local', 'citizen', 'official', 'authoritative_api')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_issue_events_timeline ON public.issue_events(issue_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.follow_up_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(issue_id, user_id, due_at)
);

CREATE TABLE IF NOT EXISTS public.resolution_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id UUID NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_path TEXT,
  note TEXT,
  appears_fixed BOOLEAN,
  citizen_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (photo_path IS NOT NULL OR NULLIF(BTRIM(note), '') IS NOT NULL)
);

ALTER TABLE public.issue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolution_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active issues are viewable by everyone" ON public.issues;
CREATE POLICY "Public active issues are viewable by everyone"
  ON public.issues FOR SELECT
  USING (moderation_status = 'active' AND visibility = 'public');

CREATE POLICY "Owners can view issue events" ON public.issue_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND i.user_id = auth.uid()));
CREATE POLICY "Owners can add citizen issue events" ON public.issue_events FOR INSERT
  WITH CHECK (
    source IN ('local', 'citizen')
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND i.user_id = auth.uid())
  );

CREATE POLICY "Users manage own reminders" ON public.follow_up_reminders FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners view resolution evidence" ON public.resolution_evidence FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND i.user_id = auth.uid()));
CREATE POLICY "Owners add resolution evidence" ON public.resolution_evidence FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.issues i WHERE i.id = issue_id AND i.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.record_issue_created_event()
RETURNS TRIGGER SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.issue_events(issue_id, event_type, source, created_by)
  VALUES (NEW.id, 'report_created', 'local', NEW.user_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_issue_record_initial_event ON public.issues;
CREATE TRIGGER on_issue_record_initial_event
  AFTER INSERT ON public.issues FOR EACH ROW EXECUTE FUNCTION public.record_issue_created_event();
