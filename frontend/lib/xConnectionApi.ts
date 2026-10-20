import { supabase, isSupabaseConfigured } from './supabase';
import { resolveNodeApiBaseUrl } from './nodeApiUrl';

export type XConnection = {
  connected: boolean;
  status: 'connected' | 'reauthorization_required' | 'disconnected';
  xUserId?: string;
  username?: string;
  scopes?: string[];
  connectedAt?: string;
  verifiedAt?: string;
  tokenExpiresAt?: string;
};

async function authenticatedRequest(path: string, init?: RequestInit) {
  const apiBase = resolveNodeApiBaseUrl(process.env.EXPO_PUBLIC_NODE_API_URL, __DEV__);
  if (!apiBase) throw new Error('The account service is not configured.');
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Could not verify your Civic Vigilance session.');
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error('Sign in again to continue.');

  const response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'The X account request failed.');
  }
  return response;
}

export async function getXConnection(): Promise<XConnection> {
  const response = await authenticatedRequest('/x/connection');
  return response.json();
}

export async function startXConnection(): Promise<string> {
  const response = await authenticatedRequest('/x/connect', { method: 'POST', body: '{}' });
  const body = await response.json();
  const authorizationUrl = new URL(body.authorizationUrl);
  if (authorizationUrl.origin !== 'https://x.com'
      || authorizationUrl.pathname !== '/i/oauth2/authorize') {
    throw new Error('The X authorization service returned an invalid sign-in link.');
  }
  return authorizationUrl.toString();
}

export async function disconnectXConnection(): Promise<void> {
  await authenticatedRequest('/x/connection', { method: 'DELETE' });
}
