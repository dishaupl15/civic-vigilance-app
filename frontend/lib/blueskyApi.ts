import { resolveNodeApiBaseUrl } from './nodeApiUrl';
import { getBackend } from './backend';
import { isSupabaseConfigured, supabase } from './supabase';

export interface BlueskyPublication {
  status: 'published';
  alreadyPublished: boolean;
  postUri?: string;
  postUrl: string;
}

export interface BlueskyAvailability {
  configured: boolean;
  accountHandle?: string;
  migrationReady: boolean;
  eligible: boolean;
  alreadyPublished: boolean;
  postUrl?: string;
  reason: string;
}

function sanitizePublicText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[contact removed]')
    .replace(/\b-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\b/g, '[location removed]')
    .replace(/\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Terrace|Ter)\b(?:,?\s*(?:Apt|Apartment|Unit|Suite|#)\s*[A-Za-z0-9-]+)?/gi, '[address removed]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[contact removed]')
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .trim();
}

export function formatBlueskyPostPreview(title: string, description: string): string {
  const safeTitle = sanitizePublicText(title);
  const safeDescription = sanitizePublicText(description);
  const suffix = '\n\n— Civic Vigilance';
  const available = Math.max(0, 300 - Array.from(`${safeTitle}\n\n${suffix}`).length);
  const shortDescription = Array.from(safeDescription).slice(0, available).join('').trimEnd();
  return `${safeTitle}${shortDescription ? `\n\n${shortDescription}` : ''}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function authenticatedRequest(
  path: string,
  init?: RequestInit,
  timeoutMs = 15_000,
): Promise<Record<string, unknown>> {
  const apiBase = resolveNodeApiBaseUrl(process.env.EXPO_PUBLIC_NODE_API_URL, __DEV__);
  if (!apiBase) throw new Error('Bluesky publishing is unavailable because the backend URL is not configured.');
  if (getBackend() !== 'supabase') {
    throw new Error('Bluesky publishing requires the online Civic Vigilance backend.');
  }
  if (!isSupabaseConfigured) throw new Error('Sign in to an online Civic Vigilance account before publishing.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sign in again before publishing to Bluesky.');
  }

  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${data.session.access_token}`,
        ...(init?.headers || {}),
      },
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') {
      throw new Error('Bluesky request timed out. Check the official account before retrying.');
    }
    throw new Error('Could not reach the Civic Vigilance backend. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  const body: unknown = await response.json().catch(() => ({}));
  if (!isRecord(body)) throw new Error('Bluesky publishing returned an invalid response.');
  if (!response.ok) {
    throw new Error(typeof body.error === 'string'
      ? body.error
      : 'Bluesky publishing failed. Please try again later.');
  }
  return body;
}

export async function publishIssueToBluesky(issueId: string): Promise<BlueskyPublication> {
  const body = await authenticatedRequest('/social/bluesky/publish', {
    method: 'POST',
    body: JSON.stringify({ issue_id: issueId }),
  }, 60_000);
  if (body.status !== 'published'
      || typeof body.alreadyPublished !== 'boolean'
      || typeof body.postUrl !== 'string') {
    throw new Error('The backend did not confirm a Bluesky post. Check the official account before retrying.');
  }
  let postUrl: URL;
  try {
    postUrl = new URL(body.postUrl);
  } catch {
    throw new Error('The backend returned an invalid Bluesky post link.');
  }
  if (postUrl.origin !== 'https://bsky.app') {
    throw new Error('The backend returned an invalid Bluesky post link.');
  }
  return {
    status: 'published',
    alreadyPublished: body.alreadyPublished,
    ...(typeof body.postUri === 'string' ? { postUri: body.postUri } : {}),
    postUrl: postUrl.toString(),
  };
}

export async function getBlueskyAvailability(issueId: string): Promise<BlueskyAvailability> {
  const body = await authenticatedRequest(`/social/bluesky/status?issue_id=${encodeURIComponent(issueId)}`);
  if (typeof body.configured !== 'boolean'
      || typeof body.migrationReady !== 'boolean'
      || typeof body.eligible !== 'boolean'
      || typeof body.alreadyPublished !== 'boolean'
      || typeof body.reason !== 'string') {
    throw new Error('The backend returned an invalid Bluesky availability response.');
  }
  return {
    configured: body.configured,
    ...(typeof body.accountHandle === 'string'
      && /^@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(body.accountHandle)
      ? { accountHandle: body.accountHandle }
      : {}),
    migrationReady: body.migrationReady,
    eligible: body.eligible,
    alreadyPublished: body.alreadyPublished,
    ...(typeof body.postUrl === 'string' ? { postUrl: body.postUrl } : {}),
    reason: body.reason,
  };
}
