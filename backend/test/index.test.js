const http = require('http');
const app = require('../src/app');
const { validateAnalysis } = require('../src/ai-analysis');
const { parsePort } = require('../src/config');
const {
  generateReportContent,
  validateGeneratedContent,
  validateReportInput,
} = require('../src/report-content');
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

const validReportContent = {
  title: 'Road surface damage reported',
  description: 'A damaged section of road is visible in the submitted report.',
  summary: 'A road surface issue was reported.',
  awareness_caption: 'Please review this reported road surface issue.',
  hashtags: ['#CivicVigilance', '#RoadSafety'],
  category_suggestion: 'pothole',
  clarification_question: null,
};

test('report content input requires a valid category and sufficient description', () => {
  expect(validateReportInput({
    title: 'Road issue',
    category: 'pothole',
    description: 'A damaged road surface is visible.',
  })).toEqual({
    title: 'Road issue',
    category: 'pothole',
    description: 'A damaged road surface is visible.',
  });
  expect(() => validateReportInput({ category: 'crime', description: 'An unsupported issue type.' })).toThrow();
  expect(() => validateReportInput({ category: 'pothole', description: 'short' })).toThrow();
});

test('generated report content schema rejects malformed or unsupported output', () => {
  expect(validateGeneratedContent(validReportContent)).toEqual(validReportContent);
  expect(() => validateGeneratedContent({ ...validReportContent, hashtags: ['#bad tag'] })).toThrow();
  expect(() => validateGeneratedContent({ ...validReportContent, category_suggestion: 'crime' })).toThrow();
  expect(() => validateGeneratedContent({ ...validReportContent, title: '' })).toThrow();
  expect(() => validateGeneratedContent({ ...validReportContent, authority_handles: ['@InventedOfficial'] })).toThrow('unsupported fields');
});

test('report content service reports missing provider configuration without a fake response', async () => {
  const originalEndpoint = process.env.AI_TEXT_ENDPOINT;
  const originalKey = process.env.AI_TEXT_API_KEY;
  delete process.env.AI_TEXT_ENDPOINT;
  delete process.env.AI_TEXT_API_KEY;
  try {
    await expect(generateReportContent({
      input: { category: 'pothole', description: 'A damaged road surface is visible.' },
      fetchImpl: jest.fn(),
    })).rejects.toMatchObject({ status: 503 });
  } finally {
    if (originalEndpoint === undefined) delete process.env.AI_TEXT_ENDPOINT;
    else process.env.AI_TEXT_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.AI_TEXT_API_KEY;
    else process.env.AI_TEXT_API_KEY = originalKey;
  }
});

test('report content service never sends its provider credential over plain HTTP', async () => {
  const originalEndpoint = process.env.AI_TEXT_ENDPOINT;
  const originalKey = process.env.AI_TEXT_API_KEY;
  process.env.AI_TEXT_ENDPOINT = 'http://ai.example.test/generate';
  process.env.AI_TEXT_API_KEY = 'test-only-key';
  const fetchImpl = jest.fn();
  try {
    await expect(generateReportContent({
      input: { category: 'pothole', description: 'A damaged road surface is visible.' },
      fetchImpl,
    })).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  } finally {
    if (originalEndpoint === undefined) delete process.env.AI_TEXT_ENDPOINT;
    else process.env.AI_TEXT_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.AI_TEXT_API_KEY;
    else process.env.AI_TEXT_API_KEY = originalKey;
  }
});

test('report content service handles valid, malformed, and unavailable provider responses', async () => {
  const originalEndpoint = process.env.AI_TEXT_ENDPOINT;
  const originalKey = process.env.AI_TEXT_API_KEY;
  process.env.AI_TEXT_ENDPOINT = 'https://ai.example.test/generate';
  process.env.AI_TEXT_API_KEY = 'test-only-key';
  const input = { category: 'pothole', description: 'A damaged road surface is visible.' };
  const response = (status, text) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => text,
  });
  try {
    await expect(generateReportContent({
      input,
      fetchImpl: jest.fn().mockResolvedValue(response(200, JSON.stringify(validReportContent))),
    })).resolves.toEqual(validReportContent);
    await expect(generateReportContent({
      input,
      fetchImpl: jest.fn().mockResolvedValue(response(200, '{"title":')),
    })).rejects.toThrow('not valid JSON');
    await expect(generateReportContent({
      input,
      fetchImpl: jest.fn().mockResolvedValue(response(503, '')),
    })).rejects.toMatchObject({ status: 503 });
    await expect(generateReportContent({
      input,
      fetchImpl: jest.fn().mockResolvedValue(response(200, 'x'.repeat(32 * 1024 + 1))),
    })).rejects.toThrow('exceeded the allowed size');
    await expect(generateReportContent({
      input,
      fetchImpl: jest.fn().mockRejectedValue(new Error('network detail')),
    })).rejects.toMatchObject({ status: 503 });
    const controller = new AbortController();
    const providerTimeout = new Error('request aborted');
    providerTimeout.name = 'AbortError';
    const timedOutRequest = generateReportContent({
      input,
      signal: controller.signal,
      fetchImpl: jest.fn().mockRejectedValue(providerTimeout),
    });
    controller.abort();
    await expect(timedOutRequest).rejects.toMatchObject({ name: 'AbortError' });
  } finally {
    if (originalEndpoint === undefined) delete process.env.AI_TEXT_ENDPOINT;
    else process.env.AI_TEXT_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.AI_TEXT_API_KEY;
    else process.env.AI_TEXT_API_KEY = originalKey;
  }
});

test('report content endpoint requires authentication, consent, and rate limits requests', async () => {
  const unauthenticated = await request('/api/generate-report-content', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      report: { category: 'pothole', description: 'A damaged road surface is visible.' },
      privacy_notice_accepted: true,
    }),
  });
  expect(unauthenticated.status).toBe(401);

  const originalFetch = global.fetch;
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: '33333333-3333-4333-8333-333333333333' }),
  });
  try {
    const sendWithoutConsent = () => request('/api/generate-report-content', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-access-token' },
      body: JSON.stringify({ report: { category: 'pothole', description: 'A damaged road surface is visible.' } }),
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await sendWithoutConsent()).status).toBe(400);
    }
    const limited = await sendWithoutConsent();
    expect(limited.status).toBe(429);
    expect(JSON.parse(limited.body).error).toContain('Too many AI writing requests');
  } finally {
    global.fetch = originalFetch;
  }
});
