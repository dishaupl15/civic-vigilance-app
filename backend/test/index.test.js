const http = require('http');
const app = require('../src/app');
const { validateAnalysis } = require('../src/ai-analysis');
const { parsePort } = require('../src/config');
const { getOwnedStorageObject } = require('../src/routes');

let server;
let baseUrl;

beforeAll((done) => {
  server = app.listen(0, '127.0.0.1', () => {
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => {
  server.closeAllConnections?.();
  server.close(done);
});

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(path, baseUrl), options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

test('GET /api reports server health', async () => {
  const response = await request('/api');
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ service: 'civic-vigilance-api', status: 'ok' });
});

test('GET /api/health returns machine-readable health', async () => {
  const response = await request('/api/health');
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body)).toEqual({ status: 'ok', service: 'civic-vigilance-api' });
});

test('rejects an unapproved browser origin', async () => {
  const response = await request('/api/health', { headers: { origin: 'https://attacker.example' } });
  expect(response.status).toBe(403);
});

test('AI analysis authenticates before processing request details', async () => {
  const response = await request('/api/analyze-image', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_url: 'https://example.com/evidence.jpg' }),
  });
  expect(response.status).toBe(401);
});

test('AI analysis requires authentication after privacy acknowledgement', async () => {
  const response = await request('/api/analyze-image', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image_url: 'https://example.com/evidence.jpg', privacy_notice_accepted: true }),
  });
  expect(response.status).toBe(401);
});

test('account deletion requires authentication', async () => {
  const response = await request('/api/account', { method: 'DELETE' });
  expect(response.status).toBe(401);
});

test('storage URL validation accepts only objects owned by the authenticated user', () => {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  const userId = '11111111-1111-4111-8111-111111111111';
  expect(getOwnedStorageObject(
    `https://project.supabase.co/storage/v1/object/public/issue-photos/${userId}/issues/photo.jpg`,
    userId
  )).toEqual({ access: 'public', bucket: 'issue-photos', path: `${userId}/issues/photo.jpg` });
  expect(getOwnedStorageObject(
    'https://project.supabase.co/storage/v1/object/public/issue-photos/22222222-2222-4222-8222-222222222222/issues/photo.jpg',
    userId
  )).toBeNull();
  expect(getOwnedStorageObject(
    `https://attacker.example/storage/v1/object/public/issue-photos/${userId}/issues/photo.jpg`,
    userId
  )).toBeNull();
});

test('PORT validation rejects invalid values', () => {
  expect(parsePort('3000')).toBe(3000);
  expect(() => parsePort('0')).toThrow('PORT');
  expect(() => parsePort('not-a-port')).toThrow('PORT');
});

test('AI output schema accepts valid structured evidence', () => {
  expect(validateAnalysis({
    issue_category: 'pothole', description: 'Visible road-surface damage.',
    visible_evidence: ['Broken asphalt'], confidence: 0.8, needs_review: false, uncertainties: [],
  }).issue_category).toBe('pothole');
});

test('AI output schema rejects unsupported categories and confidence', () => {
  expect(() => validateAnalysis({
    issue_category: 'crime', description: 'Unsupported inference', visible_evidence: [],
    confidence: 2, needs_review: false, uncertainties: [],
  })).toThrow();
});
