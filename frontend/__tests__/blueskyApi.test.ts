import { getBlueskyAvailability, publishIssueToBluesky } from '../lib/blueskyApi';

jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: 'test-user-token' } },
        error: null,
      }),
    },
  },
}));

const originalApiUrl = process.env.EXPO_PUBLIC_NODE_API_URL;
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.EXPO_PUBLIC_NODE_API_URL = 'https://api.example.test/api';
});

afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_NODE_API_URL;
  else process.env.EXPO_PUBLIC_NODE_API_URL = originalApiUrl;
});

test('publishes by authenticated report ID and accepts only the confirmed Bluesky link', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'published',
      alreadyPublished: false,
      postUri: 'at://did:plc:civic/app.bsky.feed.post/postkey',
      postUrl: 'https://bsky.app/profile/did:plc:civic/post/postkey',
    }),
  }) as jest.Mock;

  await expect(publishIssueToBluesky('report-123')).resolves.toEqual({
    status: 'published',
    alreadyPublished: false,
    postUri: 'at://did:plc:civic/app.bsky.feed.post/postkey',
    postUrl: 'https://bsky.app/profile/did:plc:civic/post/postkey',
  });
  expect(global.fetch).toHaveBeenCalledWith(
    'https://api.example.test/api/social/bluesky/publish',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer test-user-token' }),
      body: JSON.stringify({ issue_id: 'report-123' }),
      signal: expect.any(AbortSignal),
    })
  );
});

test('surfaces authentication errors and rejects unconfirmed post links', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: 'Sign in again before publishing to Bluesky.' }),
  }).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: 'published', alreadyPublished: false, postUrl: 'https://attacker.example/post' }),
  }) as jest.Mock;

  await expect(publishIssueToBluesky('report-123')).rejects.toThrow('Sign in again');
  await expect(publishIssueToBluesky('report-123')).rejects.toThrow('invalid Bluesky post link');
});

test('accepts the safe public account handle from availability', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      configured: true,
      accountHandle: '@civic.bsky.social',
      migrationReady: true,
      eligible: true,
      alreadyPublished: false,
      reason: 'ready',
    }),
  }) as jest.Mock;

  await expect(getBlueskyAvailability('report-123')).resolves.toMatchObject({
    accountHandle: '@civic.bsky.social',
    eligible: true,
  });
});

test('times out a publication request with a safe warning to check the official account', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  })) as jest.Mock;

  try {
    const request = publishIssueToBluesky('report-123');
    const timedOut = expect(request).rejects.toThrow(
      'Bluesky request timed out. Check the official account before retrying.',
    );
    await jest.advanceTimersByTimeAsync(60_000);
    await timedOut;
  } finally {
    jest.useRealTimers();
  }
});