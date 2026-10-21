const fs = require('fs');
const path = require('path');

function isLoopbackOrLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const octets = host.split('.').map(Number);
  const isIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const isPrivateIpv4 = isIpv4 && (
    octets[0] === 0
    || octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
  );
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || host.startsWith('fe80:')
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || isPrivateIpv4;
}

function isServiceRoleKey(key) {
  if (/^sb_secret_/i.test(key)) return true;
  const parts = key.split('.');
  if (parts.length < 2) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

function validateProductionEnv(env) {
  const invalid = [];
  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_STORAGE_BUCKET',
    'EXPO_PUBLIC_PRIVATE_STORAGE_BUCKET',
    'EXPO_PUBLIC_NODE_API_URL',
    'EXPO_PUBLIC_API_URL',
  ];

  for (const name of required) {
    const value = env[name]?.trim();
    if (!value || /YOUR_|your_|example\.com/i.test(value)) invalid.push(name);
  }

  if (env.EXPO_PUBLIC_BACKEND_MODE !== 'supabase') {
    invalid.push('EXPO_PUBLIC_BACKEND_MODE=supabase');
  }
  if (env.EXPO_PUBLIC_SUPABASE_ANON_KEY && isServiceRoleKey(env.EXPO_PUBLIC_SUPABASE_ANON_KEY)) {
    invalid.push('EXPO_PUBLIC_SUPABASE_ANON_KEY (must not be a service-role/secret key)');
  }

  const parsedUrls = {};
  for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_NODE_API_URL']) {
    const value = env[name]?.trim();
    if (!value || /YOUR_|your_|example\.com/i.test(value)) continue;
    try {
      const url = new URL(value);
      parsedUrls[name] = url;
      if (url.protocol !== 'https:') invalid.push(`${name} (must use HTTPS)`);
      if (isLoopbackOrLocalHost(url.hostname)) invalid.push(`${name} (must not use localhost or a local network host)`);
      if (url.username || url.password || url.search || url.hash) {
        invalid.push(`${name} (must not contain credentials, query parameters, or fragments)`);
      }
    } catch {
      invalid.push(`${name} (invalid URL)`);
    }
  }

  const supabaseUrl = parsedUrls.EXPO_PUBLIC_SUPABASE_URL;
  if (supabaseUrl && !supabaseUrl.hostname.endsWith('.supabase.co')) {
    invalid.push('EXPO_PUBLIC_SUPABASE_URL (must target the configured Supabase project)');
  }

  const functionsUrl = parsedUrls.EXPO_PUBLIC_API_URL;
  if (supabaseUrl && functionsUrl
      && (functionsUrl.hostname !== supabaseUrl.hostname
        || functionsUrl.pathname.replace(/\/+$/, '') !== '/functions/v1')) {
    invalid.push('EXPO_PUBLIC_API_URL (must use this Supabase project at /functions/v1)');
  }

  const nodeApiUrl = parsedUrls.EXPO_PUBLIC_NODE_API_URL;
  if (nodeApiUrl && !nodeApiUrl.pathname.replace(/\/+$/, '').endsWith('/api')) {
    invalid.push('EXPO_PUBLIC_NODE_API_URL (must end in /api)');
  }
  if (nodeApiUrl?.origin === 'https://civic-vigilance-app.vercel.app') {
    invalid.push('EXPO_PUBLIC_NODE_API_URL (must target the separate backend deployment, not the production web app)');
  }

  return [...new Set(invalid)];
}

if (require.main === module) {
  const envFiles = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '.env'),
  ];
  const envFile = envFiles.find((candidate) => fs.existsSync(candidate));
  if (!process.argv.includes('--no-local-env') && envFile) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }

  const invalid = validateProductionEnv(process.env);
  if (invalid.length) {
    console.error(`Production environment is incomplete:\n- ${invalid.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Frontend production environment is valid (secret values were not printed).');
}

module.exports = { validateProductionEnv };
