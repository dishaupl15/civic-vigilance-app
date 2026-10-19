const fs = require('fs');
const path = require('path');

const envFile = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const required = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_STORAGE_BUCKET',
  'EXPO_PUBLIC_PRIVATE_STORAGE_BUCKET',
  'EXPO_PUBLIC_NODE_API_URL',
  'EXPO_PUBLIC_API_URL',
];
const invalid = required.filter((name) => !process.env[name] || /YOUR_|your_|example\.com/i.test(process.env[name]));
if (process.env.EXPO_PUBLIC_BACKEND_MODE !== 'supabase') invalid.push('EXPO_PUBLIC_BACKEND_MODE=supabase');

for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_NODE_API_URL', 'EXPO_PUBLIC_API_URL']) {
  const value = process.env[name];
  if (!value || /YOUR_|your_|example\.com/i.test(value)) continue;
  try {
    if (new URL(value).protocol !== 'https:') invalid.push(`${name} (must use HTTPS)`);
  } catch {
    invalid.push(`${name} (invalid URL)`);
  }
}

if (invalid.length) {
  console.error(`Production environment is incomplete:\n- ${[...new Set(invalid)].join('\n- ')}`);
  process.exit(1);
}
console.log('Frontend production environment is valid (secret values were not printed).');
