-- Persist one-time OAuth state and serialize refresh-token rotation across
-- backend instances. Values are accessible only to the server-side service role.

BEGIN;

CREATE TABLE public.x_oauth_attempts (
  state_hash TEXT PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  verifier_ciphertext BYTEA NOT NULL CHECK (octet_length(verifier_ciphertext) > 0),
  token_key_id TEXT NOT NULL CHECK (char_length(BTRIM(token_key_id)) > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_x_oauth_attempts_expiry
  ON public.x_oauth_attempts(expires_at);

ALTER TABLE public.x_oauth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.x_oauth_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE
  ON TABLE public.x_oauth_attempts
  TO service_role;

ALTER TABLE public.user_x_connections
  ADD COLUMN refresh_lock_id UUID,
  ADD COLUMN refresh_lock_until TIMESTAMPTZ;

REVOKE ALL ON TABLE public.user_x_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.user_x_connections
  TO service_role;

COMMIT;
