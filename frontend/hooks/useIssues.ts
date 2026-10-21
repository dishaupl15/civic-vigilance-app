import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getBackend } from '../lib/backend';
import { IssueCategory, IssueWithUserData } from '../types';
import { ReportSharingMethod } from '../types';
import { createIssueSqlite, listIssues as listIssuesSqlite } from '../lib/sqliteIssues';
import { ensureSessionUserId } from '../lib/sqliteAuth';
import { useAuth } from './useAuth';
import { calculateDistance, encodeGeohash } from '../lib/geohash';
import { mapDatabaseIssueRow, mapLocalIssueRow } from '../lib/issueMapper';
import {
  normalizeReportAddress,
  validateReportAddress,
  validateReportLocation,
} from '../lib/reportValidation';
import { MatchedAuthority } from '../lib/smartAuthorities';
import { GeneratedReportSnapshot, saveIssueEnhancements } from '../lib/issueEnhancements';
import { formatSupabaseError } from '../lib/supabaseError';

type SortMode = 'trending' | 'newest' | 'nearby';

export function useIssues(sort: SortMode, coords?: { lat: number; lng: number } | null) {
  const [data, setData] = useState<IssueWithUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { session } = useAuth();

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        if (getBackend() === 'sqlite') {
          const uid = await ensureSessionUserId();
          if (!active) return;
          const reports = listIssuesSqlite(sort === 'trending' ? sort : 'newest').map(mapLocalIssueRow);
          if (sort === 'nearby' && coords) {
            reports.sort((a, b) => {
              const distance = (issue: IssueWithUserData) =>
                issue.lat !== undefined && issue.lng !== undefined
                  ? calculateDistance(coords.lat, coords.lng, issue.lat, issue.lng)
                  : Number.POSITIVE_INFINITY;
              return distance(a) - distance(b);
            });
          }
          setData(reports);
        } else if (getBackend() === 'supabase') {
          if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
          const { data: rows, error: queryError } = await supabase
            .from('issues')
            .select('*,issue_metrics(upvotes,downvotes,comments,shares,twitter_impressions)')
            .order('created_at', { ascending: false })
            .limit(100);
          if (queryError) throw queryError;

          const reports = await Promise.all((rows ?? []).map(mapDatabaseIssueRow));
          if (!active) return;
          if (sort === 'trending') {
            reports.sort((a, b) =>
              (b.upvotes ?? 0) - (a.upvotes ?? 0) ||
              (b.commentsCount ?? 0) - (a.commentsCount ?? 0) ||
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
          } else if (sort === 'nearby' && coords) {
            const distance = (issue: IssueWithUserData) =>
              issue.lat !== undefined && issue.lng !== undefined
                ? calculateDistance(coords.lat, coords.lng, issue.lat, issue.lng)
                : Number.POSITIVE_INFINITY;
            reports.sort((a, b) => distance(a) - distance(b));
          }
          setData(reports);
        }
      } catch (cause) {
        if (active) {
          setError(formatSupabaseError(cause, 'Could not load reports.'));
          setData([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => { active = false; };
  }, [sort, coords?.lat, coords?.lng, session?.user?.id, retryCount]);

  return { data, loading, error, retry: () => setRetryCount((attempt) => attempt + 1) };
}

// Basic XSS sanitization for user input
function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export async function createIssue(payload: {
  client_request_id: string;
  user_id?: string;
  title: string;
  description: string;
  category: IssueCategory;
  photos: string[];
  lat?: number;
  lng?: number;
  address?: string;
  location_accuracy_m?: number;
  location_source: 'gps' | 'manual';
  location_confirmed: boolean;
  privacy: ReportSharingMethod;
  authorities?: string[];
  authority_suggestions?: MatchedAuthority[];
  generated_contents?: GeneratedReportSnapshot[];
}): Promise<IssueWithUserData> {
  const title = payload.title.trim();
  // Input validation
  if (!title) {
    throw new Error('Title is required');
  }
  if (title.length < 10 || title.length > 100) {
    throw new Error('Title must be between 10 and 100 characters.');
  }
  if (!payload.description || payload.description.trim().length === 0) {
    throw new Error('Description is required');
  }
  if (payload.description.length > 2000) {
    throw new Error('Description must be 2000 characters or less');
  }
  if (!payload.category) {
    throw new Error('Category is required');
  }
  if (!payload.client_request_id) throw new Error('Missing submission identifier');
  if (!payload.user_id) throw new Error('You must be signed in to submit a report');
  if (!Array.isArray(payload.photos) || payload.photos.length < 1 || payload.photos.length > 3) {
    throw new Error('One to three uploaded photos are required');
  }
  if (!payload.address?.trim() || !payload.location_confirmed) throw new Error('A confirmed location is required');
  const normalizedAddress = normalizeReportAddress(payload.address);
  const addressError = validateReportAddress(normalizedAddress);
  if (addressError) throw new Error(addressError);
  const locationError = validateReportLocation(payload.lat, payload.lng, payload.location_accuracy_m);
  if (locationError) throw new Error(locationError);
  const hasCoords = payload.lat !== undefined && payload.lng !== undefined;
  const authorities = [...new Set(payload.authorities ?? [])];
  if (authorities.some((handle) => !/^@[A-Za-z0-9_]{1,15}$/.test(handle))) {
    throw new Error('A selected authority account handle is invalid.');
  }

  // Sanitize user-generated text content
  const sanitizedPayload = {
    ...payload,
    title: sanitizeInput(title),
    description: sanitizeInput(payload.description.trim()),
    address: sanitizeInput(normalizedAddress),
  };

  if (getBackend() === 'sqlite') {
    const localUserId = await ensureSessionUserId();
    const created = await createIssueSqlite({
      user_id: localUserId,
      title: sanitizedPayload.title,
      description: sanitizedPayload.description,
      category: sanitizedPayload.category,
      image_url: sanitizedPayload.photos[0],
      lat: sanitizedPayload.lat,
      lng: sanitizedPayload.lng,
      address: sanitizedPayload.address,
    });
    return mapLocalIssueRow(created);
  }

  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const issueSelect = '*,issue_metrics(upvotes,downvotes,comments,shares,twitter_impressions)';
  const persistEnhancements = async (issueId: string) => {
    if (!payload.authority_suggestions?.length && !payload.generated_contents?.length) return;
    await saveIssueEnhancements({
      issueId,
      userId: payload.user_id!,
      category: payload.category,
      authoritySuggestions: payload.authority_suggestions ?? [],
      selectedAuthorityHandles: authorities,
      generatedContents: payload.generated_contents ?? [],
    });
  };
  const { data: existing, error: existingError } = await supabase
    .from('issues')
    .select(issueSelect)
    .eq('client_request_id', sanitizedPayload.client_request_id)
    .eq('user_id', sanitizedPayload.user_id)
    .maybeSingle();
  if (existingError) throw new Error('Could not check whether this report was already submitted.');
  if (existing) {
    await persistEnhancements(existing.id);
    return mapDatabaseIssueRow(existing);
  }

  const location = hasCoords ? `POINT(${sanitizedPayload.lng} ${sanitizedPayload.lat})` : null;
  const geohash = hasCoords ? encodeGeohash(sanitizedPayload.lat!, sanitizedPayload.lng!, 8) : '';
  const dbPayload = {
    client_request_id: sanitizedPayload.client_request_id,
    user_id: sanitizedPayload.user_id,
    title: sanitizedPayload.title,
    description: sanitizedPayload.description,
    category: sanitizedPayload.category,
    photos: sanitizedPayload.photos,
    location,
    address: sanitizedPayload.address,
    geohash,
    location_accuracy_m: sanitizedPayload.location_accuracy_m ?? null,
    location_source: sanitizedPayload.location_source,
    location_confirmed: sanitizedPayload.location_confirmed,
    authorities,
    privacy: sanitizedPayload.privacy === 'none' ? 'none' : 'personal',
    visibility: sanitizedPayload.privacy === 'none' ? 'private' : 'public',
    anonymous_username: 'Anonymous Citizen',
    status: 'pending',
  };
  const { data, error } = await supabase.from('issues').insert(dbPayload).select(issueSelect).single();
  if (error) throw error;
  await persistEnhancements(data.id);
  return mapDatabaseIssueRow(data);
}
