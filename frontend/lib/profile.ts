import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { supabase, isSupabaseConfigured } from './supabase';
import { getBackend } from './backend';

import { User } from '../types';

/** Exponential backoff retry for profile operations */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export type UserProfile = Partial<User> & { id: string };

const PROFILE_KEY = 'demo_profile';
const PREFS_KEY = 'demo_notification_prefs';

const DEFAULT_NOTIFICATIONS = {
  nearby: true,
  comments: true,
  upvotes: true,
  replies: true,
  twitter: false,
  digest: true,
  trending: false,
  similar: true,
};

export async function loadProfile(userId: string): Promise<UserProfile> {
  if (getBackend() === 'sqlite') {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    const parsed: UserProfile | null = raw ? JSON.parse(raw) : null;
    return parsed || { id: userId, full_name: 'Civic User', photoURL: undefined, createdAt: new Date() } as unknown as UserProfile;
  }

  // Supabase backend
  if (!isSupabaseConfigured) {
    return { id: userId, full_name: 'Civic User', photoURL: undefined, createdAt: new Date() } as unknown as UserProfile;
  }

  return withRetry(async () => {
    const [profileResult, userResult, preferencesResult, statsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('users').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    const firstError = [profileResult, userResult, preferencesResult, statsResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const profile = profileResult.data;
    const user = userResult.data;
    const preferences = preferencesResult.data;
    const stats = statsResult.data;
    if (profile || user) {
      return {
        id: userId,
        uid: userId,
        email: user?.email,
        username: profile?.username || user?.username || `Citizen_${userId.slice(0, 8)}`,
        full_name: profile?.full_name || user?.full_name,
        displayName: profile?.display_name || user?.display_name,
        photoURL: profile?.avatar_url || user?.photo_url,
        bio: profile?.bio || user?.bio,
        city: profile?.city || user?.city,
        state: profile?.state || user?.state,
        anonymousMode: Boolean(profile?.anonymous_mode ?? user?.anonymous_mode),
        googleConnected: Boolean(user?.google_connected),
        twitterConnected: Boolean(user?.twitter_connected),
        twitterHandle: user?.twitter_handle,
        twitterUserId: user?.twitter_user_id,
        privacyDefault: user?.privacy_default === 'none' ? 'none' : 'twitter',
        alwaysAskTwitterMethod: Boolean(user?.always_ask_twitter_method),
        isVerified: Boolean(user?.is_verified),
        verificationType: user?.verification_type,
        stats: {
          totalPosts: stats?.total_posts || 0,
          totalUpvotes: stats?.total_upvotes || 0,
          totalComments: stats?.total_comments || 0,
          totalShares: stats?.total_shares || 0,
        },
        preferences: {
          notifications: {
            nearby: preferences?.notify_nearby ?? DEFAULT_NOTIFICATIONS.nearby,
            comments: preferences?.notify_comments ?? DEFAULT_NOTIFICATIONS.comments,
            upvotes: preferences?.notify_upvotes ?? DEFAULT_NOTIFICATIONS.upvotes,
            replies: preferences?.notify_replies ?? DEFAULT_NOTIFICATIONS.replies,
            twitter: preferences?.notify_twitter ?? DEFAULT_NOTIFICATIONS.twitter,
            digest: preferences?.notify_digest ?? DEFAULT_NOTIFICATIONS.digest,
            trending: preferences?.notify_trending ?? DEFAULT_NOTIFICATIONS.trending,
            similar: preferences?.notify_similar ?? DEFAULT_NOTIFICATIONS.similar,
          },
        },
        privacySettings: {
          profileVisibility: preferences?.profile_visibility || 'public',
          showLocation: preferences?.show_location ?? true,
        },
        createdAt: new Date(user?.created_at || profile?.created_at || Date.now()),
        lastLoginAt: new Date(user?.last_login_at || Date.now()),
      } as UserProfile;
    }
    return { id: userId };
  });
}

export async function saveProfile(p: UserProfile) {
  if (getBackend() === 'sqlite') {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    return p;
  }

  // Supabase backend
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');

  const profilePayload: any = { updated_at: new Date().toISOString() };
  if (p.full_name !== undefined) profilePayload.full_name = p.full_name;
  if (p.displayName !== undefined) profilePayload.display_name = p.displayName;
  if (p.photoURL !== undefined) profilePayload.avatar_url = p.photoURL;
  if (p.bio !== undefined) profilePayload.bio = p.bio;
  if (p.city !== undefined) profilePayload.city = p.city;
  if (p.state !== undefined) profilePayload.state = p.state;
  if (p.anonymousMode !== undefined) profilePayload.anonymous_mode = p.anonymousMode;

  const userPayload: any = { updated_at: new Date().toISOString() };
  if (p.privacyDefault !== undefined) userPayload.privacy_default = p.privacyDefault === 'none' ? 'none' : 'civic_vigilance';
  if (p.alwaysAskTwitterMethod !== undefined) userPayload.always_ask_twitter_method = p.alwaysAskTwitterMethod;

  const preferencePayload: any = { updated_at: new Date().toISOString() };
  const notifications = p.preferences?.notifications;
  if (notifications) {
    preferencePayload.notify_nearby = notifications.nearby;
    preferencePayload.notify_comments = notifications.comments;
    preferencePayload.notify_upvotes = notifications.upvotes;
    preferencePayload.notify_replies = notifications.replies;
    preferencePayload.notify_twitter = notifications.twitter;
    preferencePayload.notify_digest = notifications.digest;
    preferencePayload.notify_trending = notifications.trending;
    preferencePayload.notify_similar = notifications.similar;
  }
  if (p.privacySettings) {
    preferencePayload.profile_visibility = p.privacySettings.profileVisibility;
    preferencePayload.show_location = p.privacySettings.showLocation;
  }

  const operations = [];
  if (Object.keys(profilePayload).length > 1) {
    operations.push(supabase.from('profiles').upsert(
      { id: p.id, ...profilePayload },
      { onConflict: 'id' },
    ));
  }
  if (Object.keys(userPayload).length > 1) operations.push(supabase.from('users').update(userPayload).eq('id', p.id));
  if (Object.keys(preferencePayload).length > 1) operations.push(supabase.from('user_preferences').update(preferencePayload).eq('user_id', p.id));
  const results = await Promise.all(operations);
  const error = results.find((result: any) => result.error)?.error;
  if (error) throw error;
  return loadProfile(p.id);
}

export async function pickAvatar(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
  if (res.canceled) return null;
  return res.assets[0].uri;
}

export type NotificationPrefs = {
  issue_comments: boolean;
  my_reports_updates: boolean;
  mentions: boolean;
  nearby_issues: boolean;
  email_updates: boolean;
};

export async function loadPrefs(): Promise<NotificationPrefs> {
  const raw = await AsyncStorage.getItem(PREFS_KEY);
  return raw ? JSON.parse(raw) : { issue_comments: true, my_reports_updates: true, mentions: true, nearby_issues: false, email_updates: false };
}

export async function savePrefs(p: NotificationPrefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p));
}
