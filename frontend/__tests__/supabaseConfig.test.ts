describe('Supabase client configuration', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalAnonKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    jest.dontMock('@supabase/supabase-js');
    jest.dontMock('@react-native-async-storage/async-storage');
    jest.resetModules();
  });

  test('uses the configured Supabase project and persists sessions', () => {
    const projectUrl = 'https://csxempaxpiuyfyszjqfu.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_URL = projectUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'unit-test-anon-key-value-not-a-secret';
    const createClient = jest.fn(() => ({}));
    jest.doMock('react-native-url-polyfill/auto', () => ({}));
    jest.doMock('@supabase/supabase-js', () => ({ createClient }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {},
    }));

    jest.isolateModules(() => {
      const { isSupabaseConfigured } = require('../lib/supabase');

      expect(isSupabaseConfigured).toBe(true);
    });

    expect(createClient).toHaveBeenCalledWith(
      projectUrl,
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
        }),
        global: expect.objectContaining({
          fetch: expect.any(Function),
        }),
      }),
    );
  });

  test('aborts Supabase Storage uploads that exceed the timeout', async () => {
    const projectUrl = 'https://csxempaxpiuyfyszjqfu.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_URL = projectUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'unit-test-anon-key-value-not-a-secret';
    const originalFetch = global.fetch;
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    ) as typeof fetch;
    global.fetch = fetchMock;
    jest.useFakeTimers();
    const createClient = jest.fn(() => ({}));
    jest.doMock('react-native-url-polyfill/auto', () => ({}));
    jest.doMock('@supabase/supabase-js', () => ({ createClient }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {},
    }));

    try {
      jest.isolateModules(() => {
        require('../lib/supabase');
      });
      const options = (createClient.mock.calls as unknown as [
        string,
        string,
        { global: { fetch: typeof fetch } },
      ][])[0][2];
      const upload = options.global.fetch(
        `${projectUrl}/storage/v1/object/private-issue-photos/user/issues/evidence.jpg`,
        { method: 'POST' },
      );
      const timedOut = expect(upload).rejects.toThrow('Photo storage request timed out.');

      await jest.advanceTimersByTimeAsync(30_000);
      await timedOut;
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      global.fetch = originalFetch;
    }
  });

  test('does not return a success-shaped client when Supabase is unconfigured', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    const createClient = jest.fn();
    jest.doMock('react-native-url-polyfill/auto', () => ({}));
    jest.doMock('@supabase/supabase-js', () => ({ createClient }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {},
    }));

    jest.isolateModules(() => {
      const { isSupabaseConfigured, supabase } = require('../lib/supabase');

      expect(isSupabaseConfigured).toBe(false);
      expect(() => supabase.from('issues')).toThrow('Supabase is not configured.');
    });

    expect(createClient).not.toHaveBeenCalled();
  });
});
