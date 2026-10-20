const express = require('express');
const { randomUUID } = require('crypto');
const { URLSearchParams } = require('url');
const { adminRequest, assertUserId, requireSupabaseUser } = require('./supabase-admin');
const {
  createOAuthState,
  createPkcePair,
  decodeBytea,
  decryptSecret,
  encodeBytea,
  encryptSecret,
  hashOAuthState,
  loadEncryptionKeyring,
} = require('./x-oauth-crypto');

const router = express.Router();
const REQUIRED_SCOPES = ['users.read', 'tweet.read'];
const REQUESTED_SCOPES = [...REQUIRED_SCOPES, 'offline.access'];
const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const REFRESH_LOCK_TTL_MS = 30 * 1000;
const REFRESH_WINDOW_MS = 60 * 1000;
const TOKEN_ENDPOINT = 'https://api.x.com/2/oauth2/token';
const USER_ENDPOINT = 'https://api.x.com/2/users/me';

class OAuthError extends Error {
  constructor(status, code) {
    super('X account connection could not be completed.');
    this.status = status;
    this.code = code;
  }
}

function getXConfig(env = process.env) {
  const clientId = String(env.X_CLIENT_ID || '').trim();
  const clientType = String(env.X_CLIENT_TYPE || '').trim();
  const clientSecret = String(env.X_CLIENT_SECRET || '');
  const callbackValue = String(env.X_OAUTH_CALLBACK_URL || '').trim();
  const returnValue = String(env.X_OAUTH_APP_RETURN_URL || '').trim();

  if (!clientId || !['public', 'confidential'].includes(clientType)
      || (clientType === 'confidential' && !clientSecret)
      || !callbackValue || !returnValue) {
    throw new OAuthError(503, 'configuration_missing');
  }

  let callbackUrl;
  try {
    callbackUrl = new URL(callbackValue);
  } catch {
    throw new OAuthError(503, 'configuration_invalid');
  }
  if (callbackUrl.protocol !== 'https:' || callbackUrl.username || callbackUrl.password
      || callbackUrl.search || callbackUrl.hash) {
    throw new OAuthError(503, 'configuration_invalid');
  }

  let appReturnUrl;
  try {
    appReturnUrl = new URL(returnValue);
  } catch {
    throw new OAuthError(503, 'configuration_invalid');
  }
  if (appReturnUrl.username || appReturnUrl.password || appReturnUrl.search || appReturnUrl.hash) {
    throw new OAuthError(503, 'configuration_invalid');
  }
  if (appReturnUrl.protocol === 'civicvigilance:') {
    if (appReturnUrl.hostname !== 'oauth' || appReturnUrl.pathname !== '/twitter') {
      throw new OAuthError(503, 'configuration_invalid');
    }
  } else if (appReturnUrl.protocol === 'https:') {
    const allowedOrigins = String(env.ALLOWED_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    if (!allowedOrigins.includes(appReturnUrl.origin)) {
      throw new OAuthError(503, 'configuration_invalid');
    }
  } else {
    throw new OAuthError(503, 'configuration_invalid');
  }

  return { clientId, clientType, clientSecret, callbackUrl, appReturnUrl };
}

function getCredentialKeyring() {
  try {
    return loadEncryptionKeyring();
  } catch {
    throw new OAuthError(503, 'encryption_unavailable');
  }
}

function getKey(keyring, keyId) {
  const key = keyring.keys.get(keyId);
  if (!key) throw new OAuthError(503, 'encryption_unavailable');
  return key;
}

function appReturnUrl(config, result, reason) {
  const url = new URL(config.appReturnUrl.toString());
  url.searchParams.set('x_oauth', result);
  if (reason) url.searchParams.set('reason', reason);
  return url.toString();
}

function byteaColumn(row, name) {
  try {
    return decodeBytea(row[name]);
  } catch {
    throw new OAuthError(503, 'connection_unavailable');
  }
}

function parseScopes(value) {
  if (Array.isArray(value)) return [...new Set(value.filter((scope) => typeof scope === 'string'))];
  if (typeof value === 'string') return [...new Set(value.split(/\s+/).filter(Boolean))];
  return [];
}

async function consumeOAuthAttempt(state) {
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(state)) return null;
  const query = new URLSearchParams({
    state_hash: `eq.${hashOAuthState(state)}`,
    expires_at: `gt.${new Date().toISOString()}`,
    select: 'user_id,verifier_ciphertext,token_key_id',
  });
  const rows = await adminRequest(`/rest/v1/x_oauth_attempts?${query}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

async function exchangeAuthorizationCode(config, code, verifier) {
  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.callbackUrl.toString(),
    code_verifier: verifier,
  });
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (config.clientType === 'confidential') {
    headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', config.clientId);
  }
  return requestXToken(body, headers, 'authorization_code');
}

async function refreshAccessToken(config, refreshToken) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    client_id: config.clientId,
  });
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (config.clientType === 'confidential') {
    headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
    body.delete('client_id');
  }
  return requestXToken(body, headers, 'refresh_token');
}

async function requestXToken(body, headers, grantType) {
  let response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers,
      body: body.toString(),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OAuthError(503, 'x_service_unavailable');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (payload?.error === 'invalid_grant' && grantType === 'refresh_token') {
      throw new OAuthError(401, 'invalid_grant');
    }
    if (payload?.error === 'invalid_grant' && grantType === 'authorization_code') {
      throw new OAuthError(401, 'authorization_failed');
    }
    throw new OAuthError(503, 'x_service_unavailable');
  }
  if (!payload || typeof payload.access_token !== 'string' || !payload.access_token
      || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
    throw new OAuthError(502, 'x_response_invalid');
  }
  return { ...payload, scopes: parseScopes(payload.scope) };
}

async function fetchAuthenticatedXIdentity(accessToken) {
  let response;
  try {
    response = await fetch(USER_ENDPOINT, {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OAuthError(503, 'x_service_unavailable');
  }
  const payload = await response.json().catch(() => null);
  const identity = payload?.data;
  if (!response.ok || typeof identity?.id !== 'string' || !/^[0-9]{1,32}$/.test(identity.id)
      || typeof identity.username !== 'string' || !/^[A-Za-z0-9_]{1,15}$/.test(identity.username)) {
    throw new OAuthError(response.status === 401 ? 401 : 502, 'identity_verification_failed');
  }
  return { id: identity.id, username: identity.username };
}

function encryptedTokenFields(tokens, keyring, currentRefreshToken) {
  const activeKeyId = keyring.activeKeyId;
  const key = getKey(keyring, activeKeyId);
  const refreshToken = typeof tokens.refresh_token === 'string' && tokens.refresh_token
    ? tokens.refresh_token
    : currentRefreshToken;
  const scopes = tokens.scopes;
  if (!REQUIRED_SCOPES.every((scope) => scopes.includes(scope))
      || (refreshToken && !scopes.includes('offline.access'))) {
    throw new OAuthError(502, 'requested_scopes_unavailable');
  }
  return {
    access_token_ciphertext: encodeBytea(encryptSecret(tokens.access_token, key, activeKeyId, 'access-token')),
    refresh_token_ciphertext: refreshToken
      ? encodeBytea(encryptSecret(refreshToken, key, activeKeyId, 'refresh-token'))
      : null,
    token_key_id: activeKeyId,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scopes,
  };
}

async function saveConnection(userId, identity, tokens, keyring) {
  const tokenFields = encryptedTokenFields(tokens, keyring);
  const query = new URLSearchParams({ on_conflict: 'user_id' });
  await adminRequest(`/rest/v1/user_x_connections?${query}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      x_user_id: identity.id,
      x_username: identity.username,
      connection_status: 'connected',
      verified_at: new Date().toISOString(),
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_refreshed_at: null,
      ...tokenFields,
    }),
  });
}

async function beginConnection(userId) {
  assertUserId(userId);
  const config = getXConfig();
  const keyring = getCredentialKeyring();
  const state = createOAuthState();
  const { verifier, challenge } = createPkcePair();
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS).toISOString();
  await adminRequest(`/rest/v1/x_oauth_attempts?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: 'DELETE',
  });
  await adminRequest(`/rest/v1/x_oauth_attempts?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  await adminRequest('/rest/v1/x_oauth_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      state_hash: hashOAuthState(state),
      user_id: userId,
      verifier_ciphertext: encodeBytea(encryptSecret(verifier, getKey(keyring, keyring.activeKeyId), keyring.activeKeyId, 'pkce-verifier')),
      token_key_id: keyring.activeKeyId,
      expires_at: expiresAt,
    }),
  });

  const authorizationUrl = new URL('https://x.com/i/oauth2/authorize');
  authorizationUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl.toString(),
    scope: REQUESTED_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return authorizationUrl.toString();
}

async function finishConnection({ state, code }) {
  const attempt = await consumeOAuthAttempt(state);
  if (!attempt) throw new OAuthError(400, 'state_invalid');
  assertUserId(attempt.user_id);
  const config = getXConfig();
  const keyring = getCredentialKeyring();
  const verifier = decryptSecret(
    byteaColumn(attempt, 'verifier_ciphertext'),
    getKey(keyring, attempt.token_key_id),
    attempt.token_key_id,
    'pkce-verifier',
  );
  const tokens = await exchangeAuthorizationCode(config, code, verifier);
  if (!REQUIRED_SCOPES.every((scope) => tokens.scopes.includes(scope))) {
    throw new OAuthError(403, 'requested_scopes_unavailable');
  }
  const identity = await fetchAuthenticatedXIdentity(tokens.access_token);
  await saveConnection(attempt.user_id, identity, tokens, keyring);
}

async function getConnectionRecord(userId) {
  assertUserId(userId);
  const query = new URLSearchParams({
    select: 'user_id,x_user_id,x_username,connection_status,scopes,access_token_ciphertext,refresh_token_ciphertext,token_key_id,token_expires_at,connected_at,verified_at,last_refreshed_at,refresh_lock_id,refresh_lock_until',
    user_id: `eq.${userId}`,
    limit: '1',
  });
  const rows = await adminRequest(`/rest/v1/user_x_connections?${query}`, { method: 'GET' });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function publicConnection(record) {
  if (!record) return { connected: false, status: 'disconnected' };
  return {
    connected: record.connection_status === 'connected',
    status: record.connection_status,
    xUserId: record.x_user_id,
    username: record.x_username,
    scopes: record.scopes,
    connectedAt: record.connected_at,
    verifiedAt: record.verified_at,
    tokenExpiresAt: record.token_expires_at,
  };
}

async function patchConnection(userId, filters, updates) {
  const query = new URLSearchParams({ user_id: `eq.${userId}`, ...filters });
  const rows = await adminRequest(`/rest/v1/user_x_connections?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(updates),
  });
  return Array.isArray(rows) ? rows : [];
}

async function releaseRefreshLock(userId, lockId) {
  await patchConnection(userId, { refresh_lock_id: `eq.${lockId}` }, {
    refresh_lock_id: null,
    refresh_lock_until: null,
  });
}

async function markReauthorizationRequired(userId, lockId) {
  await patchConnection(userId, { refresh_lock_id: `eq.${lockId}` }, {
    connection_status: 'reauthorization_required',
    access_token_ciphertext: null,
    refresh_token_ciphertext: null,
    token_key_id: null,
    token_expires_at: null,
    refresh_lock_id: null,
    refresh_lock_until: null,
    updated_at: new Date().toISOString(),
  });
}

async function refreshIfNeeded(userId, record) {
  if (record.connection_status !== 'connected'
      || Date.parse(record.token_expires_at) > Date.now() + REFRESH_WINDOW_MS) return record;
  if (!record.refresh_token_ciphertext) {
    await patchConnection(userId, {}, {
      connection_status: 'reauthorization_required',
      access_token_ciphertext: null,
      token_key_id: null,
      token_expires_at: null,
      refresh_lock_id: null,
      refresh_lock_until: null,
      updated_at: new Date().toISOString(),
    });
    return { ...record, connection_status: 'reauthorization_required' };
  }

  const lockId = randomUUID();
  const lockUntil = new Date(Date.now() + REFRESH_LOCK_TTL_MS).toISOString();
  const lockQuery = new URLSearchParams({
    user_id: `eq.${userId}`,
    connection_status: 'eq.connected',
    refresh_token_ciphertext: 'not.is.null',
    or: `(refresh_lock_until.is.null,refresh_lock_until.lt.${new Date().toISOString()})`,
  });
  const claimed = await adminRequest(`/rest/v1/user_x_connections?${lockQuery}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ refresh_lock_id: lockId, refresh_lock_until: lockUntil }),
  });
  if (!Array.isArray(claimed) || claimed.length !== 1) return record;

  const locked = claimed[0];
  let keyring;
  let refreshToken;
  let tokens;
  try {
    keyring = getCredentialKeyring();
    const key = getKey(keyring, locked.token_key_id);
    refreshToken = decryptSecret(
      byteaColumn(locked, 'refresh_token_ciphertext'), key, locked.token_key_id, 'refresh-token',
    );
    tokens = await refreshAccessToken(getXConfig(), refreshToken);
  } catch (error) {
    if (error instanceof OAuthError && error.code === 'invalid_grant') {
      await markReauthorizationRequired(userId, lockId);
      return { ...locked, connection_status: 'reauthorization_required' };
    }
    await releaseRefreshLock(userId, lockId);
    throw error;
  }

  try {
    const tokenFields = encryptedTokenFields(tokens, keyring, refreshToken);
    const updated = await patchConnection(userId, { refresh_lock_id: `eq.${lockId}` }, {
      ...tokenFields,
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      refresh_lock_id: null,
      refresh_lock_until: null,
    });
    if (!updated.length) throw new OAuthError(503, 'connection_unavailable');
    return updated[0];
  } catch {
    try {
      await markReauthorizationRequired(userId, lockId);
    } catch {
      console.error('[X OAuth] Unable to mark the connection for reauthorization after token persistence failed.');
    }
    throw new OAuthError(503, 'connection_unavailable');
  }
}

router.post('/x/connect', requireSupabaseUser, async (req, res, next) => {
  try {
    const authorizationUrl = await beginConnection(req.authUser.id);
    res.status(200).json({ authorizationUrl });
  } catch (error) {
    next(error);
  }
});

router.get('/x/connect/callback', async (req, res) => {
  let config;
  try {
    config = getXConfig();
  } catch {
    return res.status(503).type('text').send('X account connection is not configured.');
  }

  try {
    if (req.query.error) {
      const attempt = await consumeOAuthAttempt(req.query.state);
      if (!attempt) return res.redirect(302, appReturnUrl(config, 'error', 'invalid_or_expired'));
      return res.redirect(302, appReturnUrl(config, 'error', 'authorization_denied'));
    }
    if (typeof req.query.code !== 'string' || req.query.code.length > 4096) {
      const attempt = await consumeOAuthAttempt(req.query.state);
      if (!attempt) return res.redirect(302, appReturnUrl(config, 'error', 'invalid_or_expired'));
      return res.redirect(302, appReturnUrl(config, 'error', 'authorization_failed'));
    }

    await finishConnection({ state: req.query.state, code: req.query.code });
    return res.redirect(302, appReturnUrl(config, 'connected'));
  } catch (error) {
    if (error?.upstreamStatus === 409 || error?.code === '23505') {
      return res.redirect(302, appReturnUrl(config, 'error', 'account_already_linked'));
    }
    const safeReasons = {
      authorization_failed: 'authorization_failed',
      requested_scopes_unavailable: 'permissions_missing',
      identity_verification_failed: 'identity_verification_failed',
      state_invalid: 'invalid_or_expired',
    };
    const reason = error instanceof OAuthError
      ? safeReasons[error.code] || 'connection_failed'
      : 'connection_failed';
    return res.redirect(302, appReturnUrl(config, 'error', reason));
  }
});

router.get('/x/connection', requireSupabaseUser, async (req, res, next) => {
  try {
    const record = await getConnectionRecord(req.authUser.id);
    if (!record) return res.json(publicConnection(null));
    const refreshed = await refreshIfNeeded(req.authUser.id, record);
    return res.json(publicConnection(refreshed));
  } catch (error) {
    next(error);
  }
});

router.delete('/x/connection', requireSupabaseUser, async (req, res, next) => {
  try {
    assertUserId(req.authUser.id);
    const query = new URLSearchParams({ user_id: `eq.${req.authUser.id}` });
    await adminRequest(`/rest/v1/user_x_connections?${query}`, { method: 'DELETE' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = {
  ATTEMPT_TTL_MS,
  OAuthError,
  REQUESTED_SCOPES,
  beginConnection,
  createXOAuthRouter: () => router,
  finishConnection,
  getXConfig,
  publicConnection,
  refreshIfNeeded,
};
