const http = require('http');
const app = require('../api/[...path]');
const { validateAnalysis } = require('../src/ai-analysis');
const { parsePort } = require('../src/config');
const {
  generateReportContent,
  validateGeneratedContent,
  validateReportInput,
} = require('../src/report-content');
const {
  getOwnedStorageObject,
  getReportAiCapabilityStatus,
  validateImageAsset,
} = require('../src/routes');
const { exportAccountData } = require('../src/supabase-admin');

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

test('account data export includes notifications scoped to the authenticated user', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalClient = process.env.SUPABASE_PUBLISHABLE_KEY;
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  const queriedPaths = [];
  const userId = '11111111-1111-4111-8111-111111111111';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-only-supabase-publishable';
  process.env.SUPABASE_SECRET_KEY = 'test-only-supabase-secret';
  global.fetch = jest.fn(async (input) => {
    queriedPaths.push(new URL(String(input)).pathname + new URL(String(input)).search);
    return {
      ok: true,
      status: 200,
      json: async () => [],
    };
  });
  try {
    const result = await exportAccountData(userId);
    expect(result.data.notifications).toEqual([]);
    expect(queriedPaths).toContain(`/rest/v1/notifications?select=*&user_id=eq.${userId}`);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalClient === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = originalClient;
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
});

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

test.each([
  ['GET', '/api/report-ai/capabilities'],
  ['GET', '/api/account/export'],
  ['POST', '/api/x/connect'],
  ['GET', '/api/x/connection'],
  ['DELETE', '/api/x/connection'],
  ['DELETE', '/api/account'],
  ['POST', '/api/social/bluesky/publish'],
  ['GET', '/api/social/bluesky/status?issue_id=11111111-1111-4111-8111-111111111111'],
  ['POST', '/api/analyze-image'],
  ['POST', '/api/generate-report-content'],
])('%s %s requires authentication', async (method, path) => {
  const response = await request(path, { method });
  expect(response.status).toBe(401);
  expect(JSON.parse(response.body).error).toMatch(/Authentication is required/);
});

test('GET /api/x/connect/callback reaches the Express OAuth callback', async () => {
  const response = await request('/api/x/connect/callback?error=access_denied&state=invalid');
  expect([302, 503]).toContain(response.status);
  expect(response.status).not.toBe(404);
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
  expect(getOwnedStorageObject(
    `supabase-storage://private-issue-photos/${userId}/issues/photo.jpg`,
    userId
  )).toEqual({
    access: 'private-reference',
    bucket: 'private-issue-photos',
    path: `${userId}/issues/photo.jpg`,
  });
  expect(getOwnedStorageObject(
    `supabase-storage://private-issue-photos/22222222-2222-4222-8222-222222222222/issues/photo.jpg`,
    userId
  )).toBeNull();
});

test('image validation rejects unsupported and oversized evidence assets', async () => {
  const originalFetch = global.fetch;
  let contentType = 'image/gif';
  let contentLength = '1024';
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: {
      get: (name) => ({
        'content-type': contentType,
        'content-length': contentLength,
      }[name.toLowerCase()] || null),
    },
  });
  try {
    await expect(validateImageAsset('https://project.supabase.co/signed-photo'))
      .rejects.toMatchObject({ status: 415 });
    contentType = 'image/jpeg';
    contentLength = String(10 * 1024 * 1024 + 1);
    await expect(validateImageAsset('https://project.supabase.co/signed-photo'))
      .rejects.toMatchObject({ status: 413 });
  } finally {
    global.fetch = originalFetch;
  }
});

test('AI capability check identifies missing and invalid server configuration without exposing values', () => {
  const keys = [
    'GROQ_API_KEY',
    'AI_VISION_ENDPOINT',
    'AI_VISION_API_KEY',
    'AI_TEXT_ENDPOINT',
    'AI_TEXT_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const originalValues = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    expect(getReportAiCapabilityStatus()).toEqual({
      available: false,
      missing: [
        'GROQ_API_KEY',
        'SUPABASE_URL',
        'SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY',
        'SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY',
      ],
      invalid: [],
    });

    process.env.AI_VISION_ENDPOINT = 'http://vision.example.test/analyze';
    process.env.AI_VISION_API_KEY = 'test-only-vision-key';
    process.env.AI_TEXT_ENDPOINT = 'https://text.example.test/generate';
    process.env.AI_TEXT_API_KEY = 'test-only-text-key';
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'test-only-client-key';
    process.env.SUPABASE_SECRET_KEY = 'test-only-supabase-secret';
    const status = getReportAiCapabilityStatus();
    expect(status).toMatchObject({
      available: false,
      missing: [],
      invalid: ['AI_VISION_ENDPOINT (must be a valid HTTPS URL)'],
    });
    expect(JSON.stringify(status)).not.toContain('test-only');

    process.env.GROQ_API_KEY = 'test-only-groq-key';
    expect(getReportAiCapabilityStatus()).toMatchObject({
      available: true,
      missing: [],
      invalid: [],
    });
  } finally {
    for (const key of keys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  }
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

test('report content accepts an empty description when image analysis is provided', () => {
  expect(validateReportInput(
    { title: '', category: 'pothole', description: '' },
    { allowEmptyDescription: true }
  )).toEqual({ title: '', category: 'pothole', description: '' });
  expect(() => validateReportInput(
    { title: '', category: 'pothole', description: '' }
  )).toThrow();
});

test('generated report content schema rejects malformed or unsupported output', () => {
  expect(validateGeneratedContent(validReportContent)).toEqual(validReportContent);
  expect(() => validateGeneratedContent({ ...validReportContent, hashtags: ['#bad tag'] })).toThrow();
  expect(() => validateGeneratedContent({ ...validReportContent, category_suggestion: 'crime' })).toThrow();
  expect(() => validateGeneratedContent({ ...validReportContent, title: '' })).toThrow();
  expect(() => validateGeneratedContent({ ...validReportContent, description: 'x'.repeat(501) })).toThrow();
  expect(() => validateGeneratedContent({ ...validReportContent, authority_handles: ['@InventedOfficial'] })).toThrow('unsupported fields');
});

test('report content service reports missing provider configuration without a fake response', async () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalEndpoint = process.env.AI_TEXT_ENDPOINT;
  const originalKey = process.env.AI_TEXT_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.AI_TEXT_ENDPOINT;
  delete process.env.AI_TEXT_API_KEY;
  try {
    await expect(generateReportContent({
      input: { category: 'pothole', description: 'A damaged road surface is visible.' },
      fetchImpl: jest.fn(),
    })).rejects.toMatchObject({ status: 503 });
  } finally {
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalEndpoint === undefined) delete process.env.AI_TEXT_ENDPOINT;
    else process.env.AI_TEXT_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.AI_TEXT_API_KEY;
    else process.env.AI_TEXT_API_KEY = originalKey;
  }
});

test('report content service never sends its provider credential over plain HTTP', async () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalEndpoint = process.env.AI_TEXT_ENDPOINT;
  const originalKey = process.env.AI_TEXT_API_KEY;
  delete process.env.GROQ_API_KEY;
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
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalEndpoint === undefined) delete process.env.AI_TEXT_ENDPOINT;
    else process.env.AI_TEXT_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.AI_TEXT_API_KEY;
    else process.env.AI_TEXT_API_KEY = originalKey;
  }
});

test('report content service handles valid, malformed, and unavailable provider responses', async () => {
  const originalGroqKey = process.env.GROQ_API_KEY;
  const originalEndpoint = process.env.AI_TEXT_ENDPOINT;
  const originalKey = process.env.AI_TEXT_API_KEY;
  delete process.env.GROQ_API_KEY;
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
    if (originalGroqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroqKey;
    if (originalEndpoint === undefined) delete process.env.AI_TEXT_ENDPOINT;
    else process.env.AI_TEXT_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.AI_TEXT_API_KEY;
    else process.env.AI_TEXT_API_KEY = originalKey;
  }
});

test('Groq configuration failures return actionable safe guidance instead of a generic 503', async () => {
  const keys = [
    'GROQ_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
  ];
  const originalValues = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const userId = '11111111-1111-4111-8111-111111111111';
  process.env.GROQ_API_KEY = 'test-only-groq-key';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-client-key';
  process.env.SUPABASE_SECRET_KEY = 'test-admin-key';
  const asJsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  global.fetch = jest.fn(async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return asJsonResponse({ id: userId });
    if (options.method === 'HEAD') {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => ({
          'content-type': 'image/jpeg',
          'content-length': '5',
        }[name.toLowerCase()] || null) },
      };
    }
    if (url.includes('/storage/v1/object/sign/') && options.method === 'POST') {
      return asJsonResponse({
        signedURL: `/object/sign/private-issue-photos/${userId}/issues/evidence.jpg?token=test`,
      });
    }
    if (url.includes('/storage/v1/object/sign/private-issue-photos/')) {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => ({
          'content-type': 'image/jpeg',
          'content-length': '5',
        }[name.toLowerCase()] || null) },
        arrayBuffer: async () => Buffer.from('photo'),
      };
    }
    if (url === 'https://api.groq.com/openai/v1/chat/completions') {
      return {
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: { message: 'sensitive upstream details' } }),
      };
    }
    throw new Error(`Unexpected mocked fetch: ${url}`);
  });

  try {
    const response = await request('/api/generate-report-content', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-user-token' },
      body: JSON.stringify({
        report: { category: 'pothole', title: '', description: '' },
        image_reference: `supabase-storage://private-issue-photos/${userId}/issues/evidence.jpg`,
        privacy_notice_accepted: true,
      }),
    });
    expect(response.status).toBe(503);
    expect(JSON.parse(response.body).error).toContain('Verify GROQ_API_KEY');
    expect(response.body).not.toContain('sensitive upstream details');
    expect(response.body).not.toContain('test-only-groq-key');
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
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

test('report content endpoint analyzes an owned private photo before drafting content', async () => {
  const keys = [
    'GROQ_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'AI_VISION_ENDPOINT',
    'AI_VISION_API_KEY',
    'AI_TEXT_ENDPOINT',
    'AI_TEXT_API_KEY',
  ];
  const originalValues = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const userId = '11111111-1111-4111-8111-111111111111';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-client-key';
  process.env.SUPABASE_SECRET_KEY = 'test-admin-key';
  process.env.GROQ_API_KEY = 'test-only-groq-key';
  delete process.env.AI_VISION_ENDPOINT;
  delete process.env.AI_VISION_API_KEY;
  delete process.env.AI_TEXT_ENDPOINT;
  delete process.env.AI_TEXT_API_KEY;
  const asJsonResponse = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  global.fetch = jest.fn(async (input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return asJsonResponse({ id: userId });
    if (options.method === 'HEAD') {
      return {
        ok: true,
        status: 200,
        headers: {
          get: (key) => ({
            'content-type': 'image/jpeg',
            'content-length': '1234',
          }[key.toLowerCase()] || null),
        },
      };
    }
    if (url.includes('/storage/v1/object/sign/') && options.method === 'POST') {
      return asJsonResponse({
        signedURL: `/object/sign/private-issue-photos/${userId}/issues/evidence.jpg?token=test`,
      });
    }
    if (url.includes('/storage/v1/object/sign/private-issue-photos/')) {
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => ({
          'content-type': 'image/jpeg',
          'content-length': '5',
        }[name.toLowerCase()] || null) },
        arrayBuffer: async () => Buffer.from('photo'),
      };
    }
    if (url === 'https://api.groq.com/openai/v1/chat/completions') {
      const payload = JSON.parse(options.body);
      const imageRequest = payload.messages[1].content.some((part) => part.type === 'image_url');
      const generated = imageRequest ? {
        issue_category: 'pothole',
        description: 'A broken road surface is visible.',
        visible_evidence: ['Broken asphalt'],
        confidence: 0.9,
        needs_review: false,
        uncertainties: [],
      } : {
        title: 'Visible damage to the road surface',
        description: 'A damaged section of road surface is visible. Please inspect and address it.',
        summary: 'Visible road surface damage.',
        awareness_caption: 'Please review this reported road issue.',
        hashtags: ['#CivicVigilance'],
        category_suggestion: null,
        clarification_question: null,
      };
      return asJsonResponse({ choices: [{ message: { content: JSON.stringify(generated) } }] });
    }
    throw new Error(`Unexpected mocked fetch: ${url}`);
  });

  try {
    const generate = (reference) => request('/api/generate-report-content', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-user-token' },
      body: JSON.stringify({
        report: { title: '', category: 'pothole', description: '' },
        image_reference: reference,
        privacy_notice_accepted: true,
      }),
    });
    const response = await generate(`supabase-storage://private-issue-photos/${userId}/issues/evidence.jpg`);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      success: true,
      analysis: { visible_evidence: ['Broken asphalt'] },
      content: {
        title: 'Visible damage to the road surface',
        description: 'A damaged section of road surface is visible. Please inspect and address it.',
      },
    });
    const groqCalls = global.fetch.mock.calls.filter(([url]) => String(url) === 'https://api.groq.com/openai/v1/chat/completions');
    expect(groqCalls).toHaveLength(2);
    expect(groqCalls[0][1].headers.authorization).toBe('Bearer test-only-groq-key');
    expect(groqCalls[0][1].body).not.toContain('private-issue-photos');

    const anotherUsersPhoto = await generate(
      'supabase-storage://private-issue-photos/22222222-2222-4222-8222-222222222222/issues/evidence.jpg'
    );
    expect(anotherUsersPhoto.status).toBe(400);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  }
});
