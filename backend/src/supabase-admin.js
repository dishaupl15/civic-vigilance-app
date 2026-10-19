const { getSupabaseAdminKey, getSupabaseClientKey } = require('./config');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseConfig(requireServiceRole = false) {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const clientKey = getSupabaseClientKey();
  const adminKey = getSupabaseAdminKey();
  if (!url || !clientKey || (requireServiceRole && !adminKey)) {
    const error = new Error('Supabase server credentials are not configured.');
    error.status = 503;
    throw error;
  }
  return { url, clientKey, adminKey };
}

function assertUserId(userId) {
  if (!UUID_PATTERN.test(String(userId || ''))) {
    const error = new Error('The authenticated user ID is invalid.');
    error.status = 400;
    throw error;
  }
}

async function fetchWithTimeout(url, options, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function requireSupabaseUser(req, _res, next) {
  try {
    const authorization = String(req.headers.authorization || '');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      const error = new Error('Authentication is required.');
      error.status = 401;
      throw error;
    }

    const { url, clientKey } = getSupabaseConfig();
    const response = await fetchWithTimeout(`${url}/auth/v1/user`, {
      headers: { apikey: clientKey, authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const error = new Error('Your session is invalid or expired.');
      error.status = 401;
      throw error;
    }
    req.authUser = await response.json();
    req.accessToken = token;
    next();
  } catch (error) {
    if (error.name === 'AbortError') {
      error.message = 'Authentication service timed out.';
      error.status = 503;
    }
    next(error);
  }
}

async function adminRequest(path, options = {}) {
  const { url, adminKey } = getSupabaseConfig(true);
  // New sb_secret_* keys belong in apikey. Legacy service-role JWTs must also
  // be sent as bearer tokens for older Supabase endpoints.
  const legacyAuthorization = adminKey.split('.').length === 3
    ? { authorization: `Bearer ${adminKey}` }
    : {};
  const response = await fetchWithTimeout(`${url}${path}`, {
    ...options,
    headers: {
      apikey: adminKey,
      ...legacyAuthorization,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`Supabase administration request failed (${response.status}).`);
    error.status = 502;
    error.upstreamStatus = response.status;
    error.detail = detail;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function purgeStorageFolder(bucket, prefix) {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const limit = 1000;
  let offset = 0;
  while (true) {
    const entries = await adminRequest(`/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      body: JSON.stringify({ prefix: cleanPrefix, limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    const page = Array.isArray(entries) ? entries : [];
    const paths = page
      .filter((entry) => entry?.name && entry?.metadata)
      .map((entry) => `${cleanPrefix}/${entry.name}`);
    if (paths.length) {
      await adminRequest(`/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: 'DELETE',
        body: JSON.stringify({ prefixes: paths }),
      });
      offset = 0;
    } else {
      offset += limit;
    }
    if (page.length < limit) break;
  }
}

async function deleteAccount(userId) {
  assertUserId(userId);
  for (const bucket of ['issue-photos', 'private-issue-photos', 'avatars']) {
    await purgeStorageFolder(bucket, `${userId}/issues`).catch((error) => {
      if (error.upstreamStatus !== 404) throw error;
    });
    await purgeStorageFolder(bucket, userId).catch((error) => {
      if (error.upstreamStatus !== 404) throw error;
    });
  }
  await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}

async function exportAccountData(userId) {
  assertUserId(userId);
  const filters = {
    users: 'id',
    profiles: 'id',
    user_stats: 'user_id',
    user_preferences: 'user_id',
    issues: 'user_id',
    votes: 'user_id',
    comments: 'user_id',
    notifications: 'user_id',
    pending_twitter_posts: 'user_id',
    follow_up_reminders: 'user_id',
    resolution_evidence: 'user_id',
  };
  const output = {};
  await Promise.all(Object.entries(filters).map(async ([table, column]) => {
    const query = new URLSearchParams({ select: '*', [column]: `eq.${userId}` });
    output[table] = await adminRequest(`/rest/v1/${table}?${query}`, { method: 'GET' });
  }));
  return { exported_at: new Date().toISOString(), user_id: userId, data: output };
}

module.exports = {
  UUID_PATTERN,
  adminRequest,
  deleteAccount,
  exportAccountData,
  purgeStorageFolder,
  requireSupabaseUser,
};
