-- Enforce report coordinate and accuracy integrity for direct Supabase writes.
-- Existing location and address-only reports remain valid.

BEGIN;

ALTER TABLE public.issues
  DROP CONSTRAINT IF EXISTS issues_location_coordinates;
ALTER TABLE public.issues
  ADD CONSTRAINT issues_location_coordinates
  CHECK (
    location IS NULL
    OR (
      ST_X(location::geometry) BETWEEN -180 AND 180
      AND ST_Y(location::geometry) BETWEEN -90 AND 90
    )
  ) NOT VALID;

ALTER TABLE public.issues
  DROP CONSTRAINT IF EXISTS issues_location_accuracy;
ALTER TABLE public.issues
  ADD CONSTRAINT issues_location_accuracy
  CHECK (
    location_accuracy_m IS NULL
    OR (
      location IS NOT NULL
      AND location_accuracy_m >= 0
      AND location_accuracy_m < 'Infinity'::DOUBLE PRECISION
    )
  ) NOT VALID;

COMMIT;
