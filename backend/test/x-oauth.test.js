const http = require('http');
const { createHash } = require('crypto');
const app = require('../src/app');
const {
  createPkcePair,
  decodeBytea,
  decryptSecret,
  encryptSecret,
  loadEncryptionKeyring,
} = require('../src/x-oauth-crypto');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const encryptionKey = Buffer.alloc(32, 7);
const encryptedKeyring = JSON.stringify({ 'test-key-v1': encryptionKey.toString('base64') });
const environment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  X_CLIENT_ID: process.env.X_CLIENT_ID,
  X_CLIENT_TYPE: process.env.X_CLIENT_TYPE,
  X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
  X_OAUTH_CALLBACK_URL: process.env.X_OAUTH_CALLBACK_URL,
  X_OAUTH_APP_RETURN_URL: process.env.X_OAUTH_APP_RETURN_URL,
  X_TOKEN_ACTIVE_KEY_ID: process.env.X_TOKEN_ACTIVE_KEY_ID,
  X_TOKEN_ENCRYPTION_KEYS_JSON: process.env.X_TOKEN_ENCRYPTION_KEYS_JSON,
};

let server;
let baseUrl;
let attempts;
let connections;
let xOwners;
let fetchMock;

function sendJson(response, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  };
}

function encodeBytea(value) {
  return `\\x${Buffer.from(value.slice(2), 'hex').toString('hex')}`;
}

function createConnection(userId, options = {}) {
  const keyring = loadEncryptionKeyring();
  const accessToken = options.accessToken || 'expired-access';
  const refreshToken = options.refreshToken === undefined ? 'refresh-good' : options.refreshToken;
  const { encryptSecret, encodeBytea: serializeBytea } = require('../src/x-oauth-crypto');
  return {
    user_id: userId,
    x_user_id: options.xUserId || '9001',
    x_username: options.username || 'RealUser',
    connection_status: options.status || 'connected',
    scopes: ['users.read', 'tweet.read', 'offline.access'],
    access_token_ciphertext: serializeBytea(
      encryptSecret(accessToken, keyring.keys.get(keyring.activeKeyId), keyring.activeKeyId, 'access-token'),
    ),
    refresh_token_ciphertext: refreshToken
      ? serializeBytea(
        encryptSecret(refreshToken, keyring.keys.get(keyring.activeKeyId), keyring.activeKeyId, 'refresh-token'),
      )
      : null,
    token_key_id: keyring.activeKeyId,
    token_expires_at: options.expiresAt || new Date(Date.now() - 1000).toISOString(),
    connected_at: new Date().toISOString(),
    verified_at: new Date().toISOString(),
    last_refreshed_at: null,
    refresh_lock_id: null,
    refresh_lock_until: null,
  };
}

function makeFetchMock() {
  return jest.fn(async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method || 'GET';
    if (url.pathname === '/auth/v1/user') {
      const token = options.headers.authorization.replace(/^Bearer\s+/i, '');
      return sendJson({ id: token === 'user-b-token' ? USER_B : USER_A });
    }
    if (url.pathname === '/2/oauth2/token') {
      const form = new URLSearchParams(options.body);
      if (form.get('grant_type') === 'authorization_code') {
        if (form.get('code') === 'invalid-code') return sendJson({ error: 'invalid_grant' }, 400);
        return sendJson({
          access_token: 'oauth-access-secret',
          refresh_token: 'oauth-refresh-secret',
          expires_in: 7200,
          scope: 'users.read tweet.read offline.access',
        });
      }
      if (form.get('refresh_token') === 'refresh-bad') {
        return sendJson({ error: 'invalid_grant' }, 400);
      }
      return sendJson({
        access_token: 'rotated-access-secret',
        refresh_token: 'rotated-refresh-secret',
        expires_in: 7200,
        scope: 'users.read tweet.read offline.access',
      });
    }
    if (url.pathname === '/2/users/me') {
      return sendJson({ data: { id: '9001', username: 'RealUser' } });
    }
    if (url.pathname === '/rest/v1/x_oauth_attempts') {
      if (method === 'POST') {
        const attempt = JSON.parse(options.body);
        attempts.set(attempt.state_hash, attempt);
        return sendJson(null, 201);
      }
      if (method === 'DELETE') {
        if (url.searchParams.has('state_hash')) {
          const hash = url.searchParams.get('state_hash').slice(3);
          const expiresAfter = new Date(url.searchParams.get('expires_at').slice(3)).getTime();
          const attempt = attempts.get(hash);
          if (!attempt || Date.parse(attempt.expires_at) <= expiresAfter) return sendJson([]);
          attempts.delete(hash);
          return sendJson([{
            user_id: attempt.user_id,
            verifier_ciphertext: attempt.verifier_ciphertext,
            token_key_id: attempt.token_key_id,
          }]);
        }
        const owner = url.searchParams.get('user_id')?.slice(3);
        const expiry = url.searchParams.get('expires_at');
        for (const [hash, attempt] of attempts) {
          if ((owner && attempt.user_id === owner)
              || (expiry && Date.parse(attempt.expires_at) < Date.parse(expiry.slice(3)))) {
            attempts.delete(hash);
          }
        }
        return sendJson(null, 204);
      }
    }
    if (url.pathname === '/rest/v1/user_x_connections') {
      const userId = (url.searchParams.get('user_id') || '').slice(3);
      const record = connections.get(userId);
      if (method === 'GET') return sendJson(record ? [record] : []);
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        const owner = xOwners.get(body.x_user_id);
        if (owner && owner !== body.user_id) return sendJson({ code: '23505' }, 409);
        xOwners.set(body.x_user_id, body.user_id);
        connections.set(body.user_id, {
          ...record,
          ...body,
          refresh_lock_id: null,
          refresh_lock_until: null,
        });
        return sendJson(null, 201);
      }
      if (method === 'PATCH') {
        if (!record) return sendJson([]);
        const lockId = url.searchParams.get('refresh_lock_id');
        if (lockId && record.refresh_lock_id !== lockId.slice(3)) return sendJson([]);
        if (url.searchParams.has('or') && record.refresh_lock_until
            && Date.parse(record.refresh_lock_until) > Date.now()) return sendJson([]);
        const body = JSON.parse(options.body);
        Object.assign(record, body);
        return sendJson([record]);
      }
      if (method === 'DELETE') {
        connections.delete(userId);
        if (record) xOwners.delete(record.x_user_id);
        return sendJson(null, 204);
      }
    }
    return sendJson({ error: `Unexpected mocked request: ${method} ${url.pathname}` }, 500);
  });
}

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
    const req = http.request(new URL(path, baseUrl), { ...options, headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function startOAuth(userToken = 'user-a-token', body = {}) {
  const response = await request('/api/x/connect', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${userToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { response, authorizationUrl: JSON.parse(response.body).authorizationUrl };
}

async function finishOAuth(authorizationUrl, params = {}) {
  const auth = new URL(authorizationUrl);
  const query = new URLSearchParams({
    state: params.state || auth.searchParams.get('state'),
    ...(params.code ? { code: params.code } : {}),
    ...(params.error ? { error: params.error } : {}),
  });
  return request(`/api/x/connect/callback?${query}`);
}

beforeAll((done) => {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    SUPABASE_SECRET_KEY: 'test-service-role-key',
    X_CLIENT_ID: 'test-client-id',
    X_CLIENT_TYPE: 'confidential',
    X_CLIENT_SECRET: 'test-client-secret',
    X_OAUTH_CALLBACK_URL: 'https://api.test/api/x/connect/callback',
    X_OAUTH_APP_RETURN_URL: 'civicvigilance://oauth/twitter',
    X_TOKEN_ACTIVE_KEY_ID: 'test-key-v1',
    X_TOKEN_ENCRYPTION_KEYS_JSON: encryptedKeyring,
  });
  server = app.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  server.closeAllConnections?.();
  server.close(() => {
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    done();
  });
});

beforeEach(() => {
  attempts = new Map();
  connections = new Map();
  xOwners = new Map();
  fetchMock = makeFetchMock();
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('connect start uses PKCE, required scopes, and ignores client identity claims', async () => {
  const { response, authorizationUrl } = await startOAuth('user-a-token', {
    user_id: USER_B,
    x_username: 'Unverified',
  });
  const url = new URL(authorizationUrl);
  expect(response.status).toBe(200);
  expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');
  expect(url.searchParams.get('scope')).toBe('users.read tweet.read offline.access');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(url.searchParams.get('code_verifier')).toBeNull();
  expect(attempts.size).toBe(1);
  expect([...attempts.values()][0].user_id).toBe(USER_A);
  expect(response.body).not.toContain('test-client-secret');
});

test('public X clients send the client ID in the token request without a client secret', async () => {
  process.env.X_CLIENT_TYPE = 'public';
  delete process.env.X_CLIENT_SECRET;
  try {
    const { authorizationUrl } = await startOAuth();
    await finishOAuth(authorizationUrl, { code: 'valid-code' });
    const tokenCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/2/oauth2/token'));
    const body = new URLSearchParams(tokenCall[1].body);
    expect(body.get('client_id')).toBe('test-client-id');
    expect(tokenCall[1].headers.authorization).toBeUndefined();
  } finally {
    process.env.X_CLIENT_TYPE = 'confidential';
    process.env.X_CLIENT_SECRET = 'test-client-secret';
  }
});

test('AES-GCM token encryption authenticates ciphertext and PKCE material is verifier/challenge separated', () => {
  const { verifier, challenge } = createPkcePair();
  expect(verifier).not.toBe(challenge);
  expect(verifier).toHaveLength(43);
  expect(challenge).toHaveLength(43);
  const ciphertext = encryptSecret(
    'sensitive-token',
    encryptionKey,
    'test-key-v1',
    'access-token',
  );
  expect(decryptSecret(ciphertext, encryptionKey, 'test-key-v1', 'access-token')).toBe('sensitive-token');
  const tampered = Buffer.from(ciphertext);
  tampered[tampered.length - 1] ^= 1;
  expect(() => decryptSecret(tampered, encryptionKey, 'test-key-v1', 'access-token')).toThrow();
});

test('valid callback stores only X-verified identity and encrypted tokens for the initiating user', async () => {
  const { authorizationUrl } = await startOAuth('user-a-token', { x_username: 'fake' });
  const callback = await finishOAuth(authorizationUrl, { code: 'valid-code' });
  expect(callback.status).toBe(302);
  expect(callback.headers.location).toBe('civicvigilance://oauth/twitter?x_oauth=connected');
  const stored = connections.get(USER_A);
  expect(stored.x_user_id).toBe('9001');
  expect(stored.x_username).toBe('RealUser');
  expect(stored.access_token_ciphertext).not.toContain('oauth-access-secret');
  expect(stored.refresh_token_ciphertext).not.toContain('oauth-refresh-secret');
  const keyring = loadEncryptionKeyring();
  expect(decryptSecret(
    decodeBytea(stored.access_token_ciphertext),
    keyring.keys.get(stored.token_key_id),
    stored.token_key_id,
    'access-token',
  )).toBe('oauth-access-secret');
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('api.x.com/2/users/me'))).toBe(true);
  const status = await request('/api/x/connection', {
    headers: { authorization: 'Bearer user-a-token' },
  });
  expect(JSON.parse(status.body)).toMatchObject({ connected: true, username: 'RealUser' });
  expect(status.body).not.toContain('oauth-access-secret');
});

test('state mismatch does not bind another user and consumed state cannot be replayed', async () => {
  const { authorizationUrl } = await startOAuth();
  const wrongState = await finishOAuth(authorizationUrl, {
    state: 'A'.repeat(43),
    code: 'valid-code',
  });
  expect(wrongState.headers.location).toContain('invalid_or_expired');
  expect(connections.has(USER_A)).toBe(false);

  const accepted = await finishOAuth(authorizationUrl, { code: 'valid-code' });
  expect(accepted.headers.location).toContain('x_oauth=connected');
  const replay = await finishOAuth(authorizationUrl, { code: 'valid-code' });
  expect(replay.headers.location).toContain('invalid_or_expired');
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/2/oauth2/token')).length).toBe(1);
});

test('X authorization denial consumes state without exchanging a code', async () => {
  const { authorizationUrl } = await startOAuth();
  const denied = await finishOAuth(authorizationUrl, { error: 'access_denied' });
  expect(denied.headers.location).toContain('authorization_denied');
  expect(attempts.size).toBe(0);
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/2/oauth2/token'))).toBe(false);
});

test('invalid authorization code consumes state and does not persist a connection', async () => {
  const { authorizationUrl } = await startOAuth();
  const failed = await finishOAuth(authorizationUrl, { code: 'invalid-code' });
  expect(failed.headers.location).toContain('authorization_failed');
  expect(attempts.size).toBe(0);
  expect(connections.size).toBe(0);
});

test('expired state is rejected before contacting X', async () => {
  const { authorizationUrl } = await startOAuth();
  const state = new URL(authorizationUrl).searchParams.get('state');
  const hash = createHash('sha256').update(state).digest('hex');
  attempts.get(hash).expires_at = new Date(Date.now() - 1000).toISOString();
  const response = await finishOAuth(authorizationUrl, { code: 'valid-code' });
  expect(response.headers.location).toContain('invalid_or_expired');
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/2/oauth2/token'))).toBe(false);
});

test('one X identity cannot be connected to a second Civic Vigilance user', async () => {
  const existing = createConnection(USER_B, { expiresAt: new Date(Date.now() + 60_000).toISOString() });
  connections.set(USER_B, existing);
  xOwners.set(existing.x_user_id, USER_B);
  const { authorizationUrl } = await startOAuth('user-a-token');
  const response = await finishOAuth(authorizationUrl, { code: 'valid-code' });
  expect(response.headers.location).toContain('account_already_linked');
  expect(connections.has(USER_A)).toBe(false);
});

test('connection status is scoped to the authenticated Civic Vigilance user', async () => {
  connections.set(USER_A, createConnection(USER_A, {
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }));
  const response = await request('/api/x/connection', {
    headers: { authorization: 'Bearer user-b-token' },
  });
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ connected: false, status: 'disconnected' });
  expect(response.body).not.toContain('RealUser');
});

test('refresh success stores rotated encrypted tokens; invalid grant requires reauthorization', async () => {
  connections.set(USER_A, createConnection(USER_A));
  xOwners.set('9001', USER_A);
  const refreshed = await request('/api/x/connection', {
    headers: { authorization: 'Bearer user-a-token' },
  });
  expect(JSON.parse(refreshed.body)).toMatchObject({ connected: true, username: 'RealUser' });
  const keyring = loadEncryptionKeyring();
  const record = connections.get(USER_A);
  expect(decryptSecret(
    decodeBytea(record.refresh_token_ciphertext),
    keyring.keys.get(record.token_key_id),
    record.token_key_id,
    'refresh-token',
  )).toBe('rotated-refresh-secret');

  connections.set(USER_A, createConnection(USER_A, { refreshToken: 'refresh-bad' }));
  const needsReconnect = await request('/api/x/connection', {
    headers: { authorization: 'Bearer user-a-token' },
  });
  expect(JSON.parse(needsReconnect.body)).toMatchObject({
    connected: false,
    status: 'reauthorization_required',
  });
  expect(connections.get(USER_A).access_token_ciphertext).toBeNull();
  expect(connections.get(USER_A).refresh_token_ciphertext).toBeNull();
});

test('disconnect removes the current user connection and leaves other users untouched', async () => {
  connections.set(USER_A, createConnection(USER_A));
  connections.set(USER_B, createConnection(USER_B, { xUserId: '9002' }));
  const response = await request('/api/x/connection', {
    method: 'DELETE',
    headers: { authorization: 'Bearer user-a-token' },
  });
  expect(response.status).toBe(204);
  expect(connections.has(USER_A)).toBe(false);
  expect(connections.has(USER_B)).toBe(true);
});

test('missing X configuration fails closed without exposing credentials', async () => {
  const clientId = process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_ID;
  try {
    const response = await request('/api/x/connect', {
      method: 'POST',
      headers: { authorization: 'Bearer user-a-token', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(503);
    expect(response.body).not.toContain('test-client-secret');
    expect(response.body).not.toContain('oauth-access-secret');
  } finally {
    process.env.X_CLIENT_ID = clientId;
  }
});

test('database errors and API responses do not log or return OAuth token values', async () => {
  connections.set(USER_A, createConnection(USER_A, {
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }));
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname === '/auth/v1/user') return sendJson({ id: USER_A });
    if (url.pathname === '/rest/v1/user_x_connections') {
      return sendJson({ error: 'oauth-access-secret oauth-refresh-secret' }, 500);
    }
    return originalFetch(input, options);
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request('/api/x/connection', {
    headers: { authorization: 'Bearer user-a-token' },
  });
  expect(response.status).toBe(502);
  expect(response.body).not.toContain('oauth-access-secret');
  expect(response.body).not.toContain('oauth-refresh-secret');
  expect(log.mock.calls.flat().join(' ')).not.toContain('oauth-access-secret');
  expect(log.mock.calls.flat().join(' ')).not.toContain('oauth-refresh-secret');
});
