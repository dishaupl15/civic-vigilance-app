const express = require('express');
const { randomUUID } = require('crypto');
const routes = require('./routes');
const { parseAllowedOrigins } = require('./config');

const app = express();
app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.use((req, res, next) => {
  const requestId = String(req.headers['x-request-id'] || '').trim();
  req.requestId = /^[A-Za-z0-9._-]{1,100}$/.test(requestId) ? requestId : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const origin = req.headers.origin;
  const allowedOrigins = parseAllowedOrigins();
  const isDevelopmentOrigin = process.env.NODE_ENV !== 'production'
    && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || '');
  if (origin && !allowedOrigins.has(origin.replace(/\/$/, '')) && !isDevelopmentOrigin) {
    return res.status(403).json({ error: 'Origin is not allowed.' });
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Confirm-Account-Deletion, X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, _req, res, _next) => {
  const candidateStatus = Number.isInteger(error.status) ? error.status : 500;
  const status = candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 500;
  if (status >= 500) console.error(`[API] Request ${_req.requestId || 'unknown'} failed:`, error.message);
  res.status(status).json({ error: status >= 500 ? 'The service is temporarily unavailable.' : error.message });
});

module.exports = app;
