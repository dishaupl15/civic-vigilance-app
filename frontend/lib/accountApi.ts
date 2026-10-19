import { supabase, isSupabaseConfigured } from './supabase';

async function authenticatedRequest(path: string, init?: RequestInit) {
  const apiBase = process.env.EXPO_PUBLIC_NODE_API_URL;
  if (!apiBase) throw new Error('The account service is not configured.');
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data } = await supabase.auth.getSession();
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
    throw new Error(body.error || 'The account request failed.');
  }
  return response;
}

export async function deleteCurrentAccount() {
  await authenticatedRequest('/account', {
    method: 'DELETE',
    headers: { 'x-confirm-account-deletion': 'DELETE' },
  });
}

export async function exportCurrentAccount() {
  const response = await authenticatedRequest('/account/export');
  return response.json();
}
