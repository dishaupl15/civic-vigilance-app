import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
    }
  })
  : unavailableClient;

export { supabase };
