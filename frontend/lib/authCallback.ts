import { sha256 } from 'js-sha256';

export const AUTH_CALLBACK_URL = 'civicvigilance://auth/callback';
export const PRODUCTION_WEB_AUTH_CALLBACK_URL = 'https://civic-vigilance-app.vercel.app/';

export type AuthCallbackPlatform = 'native' | 'web';

export interface AuthCallbackRuntime {
  platform: AuthCallbackPlatform;
  isDevelopment: boolean;
  webOrigin?: string;
}

const CALLBACK_ERROR_MESSAGE =
  'This authentication link is invalid, expired, or already used. Request a new link and try again.';
const SUPPORTED_OTP_TYPES = new Set(['signup', 'recovery', 'invite', 'email']);
type SupportedOtpType = 'signup' | 'recovery' | 'invite' | 'email';

export function getAuthRedirectUrl(runtime: AuthCallbackRuntime): string {
  if (runtime.platform === 'native') return AUTH_CALLBACK_URL;
  if (!runtime.isDevelopment) return PRODUCTION_WEB_AUTH_CALLBACK_URL;
  if (!runtime.webOrigin) {
    throw new Error('The local web address is unavailable. Restart the app from its development server.');
  }

  let origin: URL;
  try {
    origin = new URL(runtime.webOrigin);
  } catch {
    throw new Error('The local web address is invalid. Restart the app from its development server.');
  }
  if (
    !['http:', 'https:'].includes(origin.protocol)
    || origin.username
    || origin.password
    || origin.origin === 'null'
  ) {
    throw new Error('The local web address is invalid. Restart the app from its development server.');
  }
  return new URL('/', origin.origin).toString();
}

function isSupportedOtpType(value: string): value is SupportedOtpType {
  return SUPPORTED_OTP_TYPES.has(value);
}

export interface ParsedAuthCallback {
  code?: string;
  tokenHash?: string;
  type?: string;
  accessToken?: string;
  refreshToken?: string;
  hasError: boolean;
}

interface AuthCallbackOperations {
  exchangeCodeForSession: (code: string) => Promise<{ error: unknown; redirectType?: string | null }>;
  verifyOtp: (tokenHash: string, type: 'signup' | 'recovery' | 'invite' | 'email') => Promise<{ error: unknown }>;
  setSession: (accessToken: string, refreshToken: string) => Promise<{ error: unknown }>;
}

export type AuthCallbackResult = 'ignored' | 'duplicate' | 'confirmed' | 'recovery';

export function parseAuthCallbackUrl(
  rawUrl: string,
  runtime: AuthCallbackRuntime = { platform: 'native', isDevelopment: false },
): ParsedAuthCallback | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (runtime.platform === 'native') {
    if (url.protocol !== 'civicvigilance:' || url.hostname !== 'auth' || url.pathname !== '/callback') {
      return null;
    }
  } else {
    const expectedOrigin = runtime.isDevelopment
      ? runtime.webOrigin
      : new URL(PRODUCTION_WEB_AUTH_CALLBACK_URL).origin;
    if (
      !expectedOrigin
      || url.origin !== expectedOrigin
      || url.pathname !== '/'
      || !['http:', 'https:'].includes(url.protocol)
    ) {
      return null;
    }
  }

  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, '').replace(/^\?/, ''));
  hashParams.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });

  if (runtime.platform === 'web' && ![
    'code',
    'token_hash',
    'access_token',
    'refresh_token',
    'error',
    'error_code',
    'error_description',
  ].some((name) => params.has(name))) {
    return null;
  }

  return {
    code: params.get('code') || undefined,
    tokenHash: params.get('token_hash') || undefined,
    type: params.get('type') || undefined,
    accessToken: params.get('access_token') || undefined,
    refreshToken: params.get('refresh_token') || undefined,
    hasError: params.has('error') || params.has('error_code') || params.has('error_description'),
  };
}

export function createAuthCallbackHandler(
  operations: AuthCallbackOperations,
  runtime: AuthCallbackRuntime = { platform: 'native', isDevelopment: false },
) {
  const processedUrls = new Set<string>();
  const inFlight = new Map<string, Promise<AuthCallbackResult>>();

  return async (rawUrl: string): Promise<AuthCallbackResult> => {
    const callback = parseAuthCallbackUrl(rawUrl, runtime);
    if (!callback) return 'ignored';
    const callbackFingerprint = sha256(rawUrl);

    const existing = inFlight.get(callbackFingerprint);
    if (existing) return 'duplicate';
    if (processedUrls.has(callbackFingerprint)) return 'duplicate';

    const processing = (async (): Promise<AuthCallbackResult> => {
      if (callback.hasError) throw new Error(CALLBACK_ERROR_MESSAGE);

      if (callback.code) {
        const result = await operations.exchangeCodeForSession(callback.code);
        if (result.error) throw new Error(CALLBACK_ERROR_MESSAGE);
        return callback.type === 'recovery' || result.redirectType === 'recovery' ? 'recovery' : 'confirmed';
      }

      if (callback.tokenHash && callback.type && isSupportedOtpType(callback.type)) {
        const result = await operations.verifyOtp(
          callback.tokenHash,
          callback.type,
        );
        if (result.error) throw new Error(CALLBACK_ERROR_MESSAGE);
        return callback.type === 'recovery' ? 'recovery' : 'confirmed';
      }

      if (callback.accessToken && callback.refreshToken) {
        const result = await operations.setSession(callback.accessToken, callback.refreshToken);
        if (result.error) throw new Error(CALLBACK_ERROR_MESSAGE);
        return callback.type === 'recovery' ? 'recovery' : 'confirmed';
      }

      throw new Error(CALLBACK_ERROR_MESSAGE);
    })();
    inFlight.set(callbackFingerprint, processing);
    processedUrls.add(callbackFingerprint);
    if (processedUrls.size > 20) {
      const oldest = processedUrls.values().next().value;
      if (oldest) processedUrls.delete(oldest);
    }

    try {
      return await processing;
    } finally {
      inFlight.delete(callbackFingerprint);
    }
  };
}
