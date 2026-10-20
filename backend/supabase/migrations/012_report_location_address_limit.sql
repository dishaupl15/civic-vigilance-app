-- Keep manually entered and reverse-geocoded report addresses bounded.
-- NOT VALID avoids requiring cleanup of existing reports before applying;
-- PostgreSQL still enforces the constraint for new and updated rows.

BEGIN;

ALTER TABLE public.issues
  ADD CONSTRAINT issues_address_length
  CHECK (char_length(address) <= 300) NOT VALID;

COMMIT;
