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
process.env.NODE_ENV = 'production';
try {
  require('../src/config').validateProductionEnv();
  console.log('Backend production environment is valid (secret values were not printed).');
} catch (error) {
  console.error(`Production environment is incomplete:\n- ${error.message}`);
  process.exit(1);
}
