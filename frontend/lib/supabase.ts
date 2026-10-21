import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const STORAGE_UPLOAD_TIMEOUT_MS = 30_000;

function withStorageUploadTimeout(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const method = (init?.method || (typeof Request !== 'undefined' && input instanceof Request
      ? input.method
      : 'GET')).toUpperCase();
    if (!requestUrl.includes('/storage/v1/object/') || !['POST', 'PUT'].includes(method)) {
      return fetchImpl(input, init);
    }

    const controller = new AbortController();
    const requestSignal = init?.signal
      || (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined);
    let timedOut = false;
    const abortRequest = () => controller.abort();
    if (requestSignal?.aborted) controller.abort();
    else requestSignal?.addEventListener('abort', abortRequest, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new Error('Photo storage request timed out.');
      throw error;
    } finally {
      clearTimeout(timer);
      requestSignal?.removeEventListener('abort', abortRequest);
    }
  };
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
function getSupabaseConfiguration() {
  if (!url || !anon || /YOUR_|your_/i.test(`${url}${anon}`) || /^sb_secret_/i.test(anon)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co') || anon.length < 20) {
      return null;
    }
    if (/^sb_secret_/i.test(anon)) return null;
    return { url: parsed.toString().replace(/\/$/, ''), anonKey: anon };
  } catch {
    return null;
  }
}
const configuration = getSupabaseConfiguration();
export const isSupabaseConfigured = configuration !== null;

const missingConfigurationError =
  'Supabase is not configured. Set the production Supabase URL and public anon key.';

const unavailableClient = new Proxy({} as SupabaseClient, {
  get() {
    throw new Error(missingConfigurationError);
  },
});

const supabase = configuration
  ? createClient(configuration.url, configuration.anonKey, {
    auth: {
      storage: AsyncStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      flowType: 'pkce',
      detectSessionInUrl: false
    },
    global: {
      fetch: withStorageUploadTimeout(fetch, STORAGE_UPLOAD_TIMEOUT_MS),
    },
  })
  : unavailableClient;

export { supabase };
