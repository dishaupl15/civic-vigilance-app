const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;

        const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
        process.env[match[1]] = value;
    }
}

const app = require('./app');
const { parsePort, validateProductionEnv } = require('./config');

validateProductionEnv();
const PORT = parsePort();
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

function shutdown(signal) {
    console.log(`${signal} received; stopping HTTP server.`);
    server.close((error) => process.exit(error ? 1 : 0));
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
