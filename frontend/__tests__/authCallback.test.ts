import {
  AUTH_CALLBACK_URL,
  createAuthCallbackHandler,
  getAuthRedirectUrl,
  parseAuthCallbackUrl,
  PRODUCTION_WEB_AUTH_CALLBACK_URL,
} from '../lib/authCallback';

describe('Supabase auth callback', () => {
  test('uses the app scheme callback and extracts a PKCE code', () => {
    expect(AUTH_CALLBACK_URL).toBe('civicvigilance://auth/callback');
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=one-time-code`)).toEqual({
      code: 'one-time-code',
      tokenHash: undefined,
      type: undefined,
      accessToken: undefined,
      refreshToken: undefined,
      hasError: false,
    });
  });

  test('uses the native deep link on native platforms', () => {
    expect(getAuthRedirectUrl({ platform: 'native', isDevelopment: false })).toBe(AUTH_CALLBACK_URL);
    expect(getAuthRedirectUrl({ platform: 'native', isDevelopment: true })).toBe(AUTH_CALLBACK_URL);
  });

  test('uses the actual local web origin in development and never assumes a port', () => {
    expect(getAuthRedirectUrl({
      platform: 'web',
      isDevelopment: true,
      webOrigin: 'http://localhost:8082/some/path',
    })).toBe('http://localhost:8082/');
  });

  test('always uses the production web origin in production', () => {
    expect(getAuthRedirectUrl({
      platform: 'web',
      isDevelopment: false,
      webOrigin: 'http://localhost:8081',
    })).toBe(PRODUCTION_WEB_AUTH_CALLBACK_URL);
  });

  test('rejects a missing or unsafe local web origin', () => {
    expect(() => getAuthRedirectUrl({ platform: 'web', isDevelopment: true }))
      .toThrow(/local web address is unavailable/i);
    expect(() => getAuthRedirectUrl({
      platform: 'web',
      isDevelopment: true,
      webOrigin: 'javascript:alert(1)',
    })).toThrow(/local web address is invalid/i);
  });

  test('accepts PKCE callbacks only from the current allowed web origin', () => {
    const runtime = {
      platform: 'web' as const,
      isDevelopment: true,
      webOrigin: 'http://localhost:8081',
    };
    expect(parseAuthCallbackUrl('http://localhost:8081/?code=web-code', runtime)?.code).toBe('web-code');
    expect(parseAuthCallbackUrl('http://localhost:8082/?code=wrong-origin', runtime)).toBeNull();
    expect(parseAuthCallbackUrl('http://localhost:8081/auth/callback?code=wrong-path', runtime)).toBeNull();
    expect(parseAuthCallbackUrl('http://localhost:8081/', runtime)).toBeNull();
  });

  test('accepts production web callbacks and parses code from the query or hash', () => {
    const runtime = { platform: 'web' as const, isDevelopment: false };
    expect(parseAuthCallbackUrl(`${PRODUCTION_WEB_AUTH_CALLBACK_URL}?code=prod-code`, runtime)?.code).toBe('prod-code');
    expect(parseAuthCallbackUrl(`${PRODUCTION_WEB_AUTH_CALLBACK_URL}#access_token=access&refresh_token=refresh`, runtime))
      .toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    expect(parseAuthCallbackUrl('https://example.com/?code=not-allowed', runtime)).toBeNull();
  });

  test('exchanges a PKCE code once and identifies a recovery callback', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null, redirectType: null });
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession,
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
    });
    const callback = `${AUTH_CALLBACK_URL}?code=one-time-code&type=recovery`;

    await expect(handler(callback)).resolves.toBe('recovery');
    await expect(handler(callback)).resolves.toBe('duplicate');
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith('one-time-code');
  });

  test('exchanges a production web PKCE callback using the web runtime', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null, redirectType: null });
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession,
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
    }, { platform: 'web', isDevelopment: false });

    await expect(handler(`${PRODUCTION_WEB_AUTH_CALLBACK_URL}?code=production-code`))
      .resolves.toBe('confirmed');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('production-code');
  });

  test('uses Supabase SDK redirectType to recognize a PKCE recovery callback without a URL type', async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null, redirectType: 'recovery' });
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession,
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
    });

    await expect(handler(`${AUTH_CALLBACK_URL}?code=recovery-code`)).resolves.toBe('recovery');
  });

  test('coalesces simultaneous callback deliveries', async () => {
    let finishExchange!: (value: { error: null }) => void;
    const exchangeCodeForSession = jest.fn(
      () => new Promise<{ error: null }>((resolve) => { finishExchange = resolve; }),
    );
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession,
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
    });
    const callback = `${AUTH_CALLBACK_URL}?code=one-time-code`;
    const first = handler(callback);
    const second = handler(callback);
    finishExchange({ error: null });

    await expect(first).resolves.toBe('confirmed');
    await expect(second).resolves.toBe('duplicate');
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  test('does not retry or duplicate errors for a callback already in flight', async () => {
    let failExchange!: (error: Error) => void;
    const exchangeCodeForSession = jest.fn(
      () => new Promise<{ error: Error }>((_resolve, reject) => { failExchange = reject; }),
    );
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession,
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
    });
    const callback = `${AUTH_CALLBACK_URL}?code=invalid-code`;
    const first = handler(callback);
    const duplicate = handler(callback);
    await expect(duplicate).resolves.toBe('duplicate');
    failExchange(new Error('expired'));
    await expect(first).rejects.toThrow();
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  test('verifies supported confirmation and recovery token hashes', async () => {
    const verifyOtp = jest.fn().mockResolvedValue({ error: null });
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession: jest.fn(),
      verifyOtp,
      setSession: jest.fn(),
    });

    await expect(handler(`${AUTH_CALLBACK_URL}?token_hash=signup-hash&type=signup`)).resolves.toBe('confirmed');
    await expect(handler(`${AUTH_CALLBACK_URL}?token_hash=recovery-hash&type=recovery`)).resolves.toBe('recovery');
    expect(verifyOtp).toHaveBeenNthCalledWith(1, 'signup-hash', 'signup');
    expect(verifyOtp).toHaveBeenNthCalledWith(2, 'recovery-hash', 'recovery');
  });

  test('accepts a token pair only through the SDK setSession operation', async () => {
    const setSession = jest.fn().mockResolvedValue({ error: null });
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession: jest.fn(),
      verifyOtp: jest.fn(),
      setSession,
    });

    await expect(
      handler(`${AUTH_CALLBACK_URL}#access_token=access&refresh_token=refresh&type=recovery`),
    ).resolves.toBe('recovery');
    expect(setSession).toHaveBeenCalledWith('access', 'refresh');
  });

  test('rejects malformed, unsupported, and provider-error callbacks without SDK calls', async () => {
    const operations = {
      exchangeCodeForSession: jest.fn(),
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
    };
    const handler = createAuthCallbackHandler(operations);

    await expect(handler('https://example.com/auth/callback?code=bad')).resolves.toBe('ignored');
    await expect(handler(`${AUTH_CALLBACK_URL}?token_hash=hash&type=unsupported`)).rejects.toThrow(/invalid, expired/);
    await expect(handler(`${AUTH_CALLBACK_URL}?error=access_denied`)).rejects.toThrow(/invalid, expired/);
    expect(operations.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(operations.verifyOtp).not.toHaveBeenCalled();
    expect(operations.setSession).not.toHaveBeenCalled();
  });

  test('converts SDK exchange failures to a safe callback error', async () => {
    const handler = createAuthCallbackHandler({
      exchangeCodeForSession: jest.fn().mockResolvedValue({ error: new Error('expired code') }),
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
    });

    await expect(handler(`${AUTH_CALLBACK_URL}?code=expired-code`)).rejects.toThrow(/invalid, expired/);
  });
});
