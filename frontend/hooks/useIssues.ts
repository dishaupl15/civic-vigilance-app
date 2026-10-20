import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getBackend } from '../lib/backend';
import { IssueWithUserData } from '../types';
import { createIssueSqlite, listIssues as listIssuesSqlite, ensureSeedIssues } from '../lib/sqliteIssues';
import { ensureSessionUserId } from '../lib/sqliteAuth';
import { useAuth } from './useAuth';
import { calculateDistance, encodeGeohash } from '../lib/geohash';
import { mapDatabaseIssueRow, mapLocalIssueRow } from '../lib/issueMapper';
import { validateReportLocation } from '../lib/reportValidation';

type SortMode = 'trending' | 'newest' | 'nearby';

export function useIssues(sort: SortMode, coords?: { lat: number; lng: number } | null) {
  const [data, setData] = useState<IssueWithUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();

  /* DUMMY DATA FOR GUEST MODE */
  const DUMMY_ISSUES: IssueWithUserData[] = [
    {
      id: 'dummy-1',
      userId: 'user-1',
      title: 'Pothole on Main St causing traffic',
      description: 'Large pothole in the middle lane causing severe slowdowns during rush hour. Several cars have been damaged.',
      category: 'pothole',
      photos: ['https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=800'],
      location: { lat: 19.0760, lng: 72.8777, address: 'Main Street, Mumbai', geohash: 'te7u' },
      privacy: 'twitter',
      status: 'posted',
      anonymousUsername: 'Citizen_One',
      metrics: { upvotes: 42, downvotes: 2, comments: 15, shares: 8 },
      moderation: { flagged: false, reviewed: true, status: 'active' },
      authorities: [],
      createdAt: new Date(Date.now() - 3600000), // 1 hour ago
      updatedAt: new Date(),
    },
    {
      id: 'dummy-2',
      userId: 'user-2',
      title: 'Overflowing Garbage Bin',
      description: 'The garbage bin at the market entrance has been overflowing for 3 days. Foul smell and attracting stray animals.',
      category: 'garbage',
      photos: ['https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&q=80&w=800'],
      location: { lat: 19.0800, lng: 72.8800, address: 'Market Road, Mumbai', geohash: 'te7u' },
      privacy: 'twitter',
      status: 'pending',
      anonymousUsername: 'Eco_Warrior',
      metrics: { upvotes: 128, downvotes: 5, comments: 45, shares: 32 },
      moderation: { flagged: false, reviewed: false, status: 'active' },
      authorities: [],
      createdAt: new Date(Date.now() - 86400000), // 1 day ago
      updatedAt: new Date(),
    },
    {
      id: 'dummy-3',
      userId: 'user-3',
      title: 'Broken Streetlight',
      description: 'Streetlight #452 is not working. The area is very dark and unsafe at night for pedestrians.',
      category: 'streetlight',
      photos: ['https://images.unsplash.com/photo-1555677284-6a6f9716399a?auto=format&fit=crop&q=80&w=800'],
      location: { lat: 19.0820, lng: 72.8820, address: 'Park Avenue, Mumbai', geohash: 'te7u' },
      privacy: 'twitter',
      status: 'posted',
      anonymousUsername: 'Night_Owl',
      metrics: { upvotes: 15, downvotes: 0, comments: 3, shares: 1 },
      moderation: { flagged: false, reviewed: false, status: 'active' },
      authorities: [],
      createdAt: new Date(Date.now() - 172800000), // 2 days ago
      updatedAt: new Date(),
    }
  ];

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      // Check for guest user in session
      const isGuest = session?.user?.email === '__guest__';

      if (isGuest) {
        // Return sorted dummy data for visualization
        if (__DEV__) console.log('[useIssues] Serving dummy data for Guest Mode');
        await new Promise(r => setTimeout(r, 500)); // Fake network delay

        // Clone to avoid mutating sorting reference
        let sortedIssues = [...DUMMY_ISSUES];

        if (sort === 'newest') {
          sortedIssues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (sort === 'trending') {
          sortedIssues.sort((a, b) => (b.metrics?.upvotes || 0) - (a.metrics?.upvotes || 0));
        } else if (sort === 'nearby') {
          if (coords) {
            const distance = (issue: IssueWithUserData) =>
              issue.lat !== undefined && issue.lng !== undefined
                ? calculateDistance(coords.lat, coords.lng, issue.lat, issue.lng)
                : Number.POSITIVE_INFINITY;
            sortedIssues.sort((a, b) => distance(a) - distance(b));
          } else {
            sortedIssues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
        }

        setData(sortedIssues);
        setLoading(false);
        return;
      }

      try {
        setError(null);
        if (getBackend() === 'sqlite') {
          const uid = await ensureSessionUserId();
          ensureSeedIssues(uid);
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
          if (queryError) throw new Error('Could not load reports. Please try again.');

          const reports = await Promise.all((rows ?? []).map(mapDatabaseIssueRow));
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
        setError(cause instanceof Error ? cause.message : 'Could not load reports.');
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [sort, coords?.lat, coords?.lng, session?.user?.id]);

  return { data, loading, error };
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
  category: string;
  photos: string[];
  lat?: number;
  lng?: number;
  address?: string;
  location_accuracy_m?: number;
  location_source: 'gps' | 'manual';
  location_confirmed: boolean;
  privacy: 'twitter' | 'none';
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
  const locationError = validateReportLocation(payload.lat, payload.lng, payload.location_accuracy_m);
  if (locationError) throw new Error(locationError);
  const hasCoords = payload.lat !== undefined && payload.lng !== undefined;

  // Sanitize user-generated text content
  const sanitizedPayload = {
    ...payload,
    title: sanitizeInput(title),
    description: sanitizeInput(payload.description.trim()),
    address: sanitizeInput(payload.address),
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
  const { data: existing, error: existingError } = await supabase
    .from('issues')
    .select(issueSelect)
    .eq('client_request_id', sanitizedPayload.client_request_id)
    .eq('user_id', sanitizedPayload.user_id)
    .maybeSingle();
  if (existingError) throw new Error('Could not check whether this report was already submitted.');
  if (existing) return mapDatabaseIssueRow(existing);

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
    privacy: sanitizedPayload.privacy === 'twitter' ? 'personal' : 'none',
    visibility: sanitizedPayload.privacy === 'none' ? 'private' : 'public',
    anonymous_username: 'Anonymous Citizen',
    status: 'pending',
  };
  const { data, error } = await supabase.from('issues').insert(dbPayload).select(issueSelect).single();
  if (error) throw error;
  return mapDatabaseIssueRow(data);
}
