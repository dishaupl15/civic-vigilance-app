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
      }),
    );
  });
});
