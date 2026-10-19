import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getBackend } from '../lib/backend';
import { Issue } from '../types';
import { createIssueSqlite, listIssues as listIssuesSqlite, ensureSeedIssues } from '../lib/sqliteIssues';
import { ensureSessionUserId } from '../lib/sqliteAuth';
import { useAuth } from './useAuth';
import { encodeGeohash } from '../lib/geohash';
import { resolvePhotoUrls } from '../lib/storage';

type SortMode = 'trending' | 'newest' | 'nearby';

export function useIssues(sort: SortMode, coords?: { lat: number; lng: number }) {
  const [data, setData] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth(); // Use context session which has the dummy user

  /* DUMMY DATA FOR GUEST MODE */
  const DUMMY_ISSUES: Issue[] = [
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
        } else if (sort === 'nearby' && coords) {
          // Sort by mock distance (simply using the order they are defined as a proxy for now, 
          // or could implement haversine if we wanted to be super fancy with dummy data)
          sortedIssues.sort((a, b) => {
            // Mock: Assume dummy-1 (Main St) is closest
            if (a.id === 'dummy-1') return -1;
            return 1;
          });
        }

        setData(sortedIssues);
        setLoading(false);
        return;
      }

      if (getBackend() === 'sqlite') {
        const uid = await ensureSessionUserId();
        ensureSeedIssues(uid);
        const list = listIssuesSqlite(sort);
        setData(list as any);
      } else if (getBackend() === 'supabase' && isSupabaseConfigured) {
        let query = supabase.from('issues').select('*');

        if (sort === 'newest') {
          query = query.order('created_at', { ascending: false });
        } else if (sort === 'trending') {
          query = query.order('upvotes', { ascending: false });
        } else if (sort === 'nearby' && coords) {
          // Geoquery: Using geohash prefix match (PRD 5.3.1)
          // Note: Real geohash query needs an RPC function or library logic, 
          // for MVP we fetch recent and client-side filter or use Supabase PostGIS if enabled.
          // Falling back to simple recency for simple nearby demo if RPC missing.
          query = query.order('created_at', { ascending: false });
        }

        const { data, error } = await query.limit(100);
        if (!error && data) {
          const issuesWithDisplayPhotos = await Promise.all(data.map(async (issue: any) => ({
            ...issue,
            photos: await resolvePhotoUrls(Array.isArray(issue.photos) ? issue.photos : []),
          })));
          setData(issuesWithDisplayPhotos as any);
        }
      }

      setLoading(false);
    };
    run();
  }, [sort, coords?.lat, coords?.lng]);

  return { data, loading };
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
}) {
  // Input validation
  if (!payload.title || payload.title.trim().length === 0) {
    throw new Error('Title is required');
  }
  if (payload.title.length > 100) {
    throw new Error('Title must be 100 characters or less');
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
  const hasCoords = typeof payload.lat === 'number' && typeof payload.lng === 'number';
  if (hasCoords && (payload.lat! < -90 || payload.lat! > 90 || payload.lng! < -180 || payload.lng! > 180)) {
    throw new Error('Coordinates are outside valid ranges');
  }

  // Sanitize user-generated text content
  const sanitizedPayload = {
    ...payload,
    title: sanitizeInput(payload.title.trim()),
    description: sanitizeInput(payload.description.trim()),
    address: sanitizeInput(payload.address),
  };

  if (getBackend() === 'sqlite') {
    const localUserId = await ensureSessionUserId();
    return await (createIssueSqlite({
      user_id: localUserId,
      title: sanitizedPayload.title,
      description: sanitizedPayload.description,
      category: sanitizedPayload.category,
      image_url: sanitizedPayload.photos[0],
      lat: sanitizedPayload.lat,
      lng: sanitizedPayload.lng,
      address: sanitizedPayload.address,
    }) as any);
  }

  const { data: existing } = await supabase
    .from('issues')
    .select('*')
    .eq('client_request_id', sanitizedPayload.client_request_id)
    .eq('user_id', sanitizedPayload.user_id)
    .single();
  if (existing) return existing;

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
  const { data, error } = await supabase.from('issues').insert(dbPayload).select('*').single();
  if (error) throw error;
  return data;
}
