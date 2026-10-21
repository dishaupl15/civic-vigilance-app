const REQUIRED_PRODUCTION_ENV = [
  'ALLOWED_ORIGIN',
  'SUPABASE_URL',
];

function isConfigured(value) {
  return typeof value === 'string' && value.trim().length > 0 && !/YOUR_|your_|example\.com/i.test(value);
}

function isPlaceholder(value) {
  return !value || /YOUR_|your_|example\.com/i.test(value);
}

function parseAllowedOrigins() {
  return new Set(
    String(process.env.ALLOWED_ORIGIN || '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean)
  );
}

function getSupabaseClientKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
}

function getSupabaseAdminKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function parsePort(value = process.env.PORT || '3000') {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseHttpsUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  return url;
}

function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => isPlaceholder(process.env[name]));
  const hasBlueskyIdentifier = isConfigured(process.env.BLUESKY_IDENTIFIER);
  const hasBlueskyPassword = isConfigured(process.env.BLUESKY_APP_PASSWORD);
  if (hasBlueskyIdentifier !== hasBlueskyPassword) {
    throw new Error('BLUESKY_IDENTIFIER and BLUESKY_APP_PASSWORD must either both be set or both be omitted.');
  }
  if (isPlaceholder(getSupabaseClientKey())) missing.push('SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY)');
  if (isPlaceholder(getSupabaseAdminKey())) missing.push('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(', ')}`);

  parsePort();
  const supabaseUrl = parseHttpsUrl(process.env.SUPABASE_URL, 'SUPABASE_URL');
  if (!supabaseUrl.hostname.endsWith('.supabase.co')) {
    throw new Error('SUPABASE_URL must be the HTTPS URL of a hosted Supabase project.');
  }
  const clientKey = getSupabaseClientKey();
  const adminKey = getSupabaseAdminKey();
  if (clientKey.length < 20 || adminKey.length < 20) {
    throw new Error('Supabase API keys appear incomplete.');
  }
  if (clientKey === adminKey) {
    throw new Error('The publishable/anon key and secret/service-role key must be different.');
  }
  for (const origin of parseAllowedOrigins()) {
    if (origin.includes('*')) throw new Error('Production ALLOWED_ORIGIN cannot contain wildcards.');
    const url = parseHttpsUrl(origin, 'Every production ALLOWED_ORIGIN');
    if (url.origin !== origin) throw new Error('Every production ALLOWED_ORIGIN must contain only an origin, without a path.');
  }

  if (!isConfigured(process.env.GROQ_API_KEY)) {
    const hasAiEndpoint = !isPlaceholder(process.env.AI_VISION_ENDPOINT);
    const hasAiKey = !isPlaceholder(process.env.AI_VISION_API_KEY);
    if (hasAiEndpoint !== hasAiKey) {
      throw new Error('AI_VISION_ENDPOINT and AI_VISION_API_KEY must either both be set or both be omitted.');
    }
    if (hasAiEndpoint) parseHttpsUrl(process.env.AI_VISION_ENDPOINT, 'AI_VISION_ENDPOINT');
    const hasTextEndpoint = !isPlaceholder(process.env.AI_TEXT_ENDPOINT);
    const hasTextKey = !isPlaceholder(process.env.AI_TEXT_API_KEY);
    if (hasTextEndpoint !== hasTextKey) {
      throw new Error('AI_TEXT_ENDPOINT and AI_TEXT_API_KEY must either both be set or both be omitted.');
    }
    if (hasTextEndpoint) parseHttpsUrl(process.env.AI_TEXT_ENDPOINT, 'AI_TEXT_ENDPOINT');
  }
}

module.exports = {
  getSupabaseAdminKey,
  getSupabaseClientKey,
  parseAllowedOrigins,
  parsePort,
  validateProductionEnv,
};
