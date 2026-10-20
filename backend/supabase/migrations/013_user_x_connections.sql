-- Store verified X account connections and application-encrypted OAuth tokens.
-- OAuth tokens and encryption keys must never be stored in plaintext.

BEGIN;

CREATE TABLE public.user_x_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  x_user_id TEXT NOT NULL UNIQUE
    CHECK (x_user_id ~ '^[0-9]{1,32}$'),
  x_username TEXT NOT NULL
    CHECK (x_username ~ '^[A-Za-z0-9_]{1,15}$'),
  connection_status TEXT NOT NULL
    CHECK (connection_status IN ('connected', 'reauthorization_required')),
  scopes TEXT[] NOT NULL
    CHECK (
      scopes @> ARRAY['users.read', 'tweet.read']::TEXT[]
      AND array_position(scopes, '') IS NULL
    ),
  access_token_ciphertext BYTEA,
  refresh_token_ciphertext BYTEA,
  token_key_id TEXT,
  token_expires_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_x_connections_token_state CHECK (
    (
      connection_status = 'connected'
      AND access_token_ciphertext IS NOT NULL
      AND octet_length(access_token_ciphertext) > 0
      AND token_key_id IS NOT NULL
      AND char_length(BTRIM(token_key_id)) > 0
      AND token_expires_at IS NOT NULL
    )
    OR (
      connection_status = 'reauthorization_required'
      AND access_token_ciphertext IS NULL
      AND refresh_token_ciphertext IS NULL
      AND token_key_id IS NULL
    )
  ),
  CONSTRAINT user_x_connections_refresh_scope CHECK (
    refresh_token_ciphertext IS NULL
    OR (
      octet_length(refresh_token_ciphertext) > 0
      AND scopes @> ARRAY['offline.access']::TEXT[]
    )
  )
);

CREATE INDEX idx_user_x_connections_status_expiry
  ON public.user_x_connections(token_expires_at)
  WHERE connection_status = 'connected';

ALTER TABLE public.user_x_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_x_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.user_x_connections
  TO service_role;

COMMENT ON TABLE public.user_x_connections IS
  'Private X OAuth connection records. Token values must be application-encrypted before storage.';
COMMENT ON COLUMN public.user_x_connections.x_user_id IS
  'X account ID obtained from the authenticated-user endpoint; never supplied as proof by the client.';
COMMENT ON COLUMN public.user_x_connections.x_username IS
  'Verified X username obtained from the authenticated-user endpoint.';
COMMENT ON COLUMN public.user_x_connections.access_token_ciphertext IS
  'Application-encrypted OAuth access token; encryption keys are managed outside the database.';
COMMENT ON COLUMN public.user_x_connections.refresh_token_ciphertext IS
  'Application-encrypted OAuth refresh token; encryption keys are managed outside the database.';
COMMENT ON COLUMN public.user_x_connections.token_key_id IS
  'Identifier for the external encryption key version used to encrypt token ciphertext.';

COMMIT;
