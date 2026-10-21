import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { supabase, isSupabaseConfigured } from './supabase';
import { getBackend } from './backend';
import { normalizePhoneNumber, validatePersonName, validatePhoneNumber } from './authValidation';
import { validateUsername } from './username';

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
    throw new Error('Supabase is not configured. Profile data could not be loaded.');
  }

  return withRetry(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user || authData.user.id !== userId) {
      throw new Error('The signed-in account does not match the requested profile.');
    }
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
        email: authData.user.email || undefined,
        username: profile?.username || user?.username || `Citizen_${userId.slice(0, 8)}`,
        first_name: profile?.first_name || undefined,
        last_name: profile?.last_name || undefined,
        phone_number: profile?.phone_number || undefined,
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
    return { id: userId, email: authData.user.email || undefined };
  });
}

export async function saveProfile(p: UserProfile) {
  const firstNameError = p.first_name === undefined || p.first_name === null
    ? null
    : validatePersonName(p.first_name, 'First name');
  if (firstNameError) throw new Error(firstNameError);
  const lastNameError = p.last_name === undefined || p.last_name === null
    ? null
    : validatePersonName(p.last_name, 'Last name');
  if (lastNameError) throw new Error(lastNameError);
  const phoneNumber = p.phone_number == null ? '' : normalizePhoneNumber(p.phone_number);
  const phoneError = validatePhoneNumber(phoneNumber);
  if (phoneError) throw new Error(phoneError);
  const username = p.username == null ? '' : p.username.trim().toLowerCase();
  if (username) {
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.isValid) throw new Error(usernameValidation.error || 'Enter a valid username.');
  }

  if (getBackend() === 'sqlite') {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    return p;
  }

  // Supabase backend
  if (!isSupabaseConfigured) throw new Error('Supabase not configured');
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error('Sign in again before updating your profile.');
  if (!authData.user || authData.user.id !== p.id) {
    throw new Error('You can update only your own profile.');
  }

    const profilePayload: any = {};
  if (p.first_name !== undefined) profilePayload.first_name = p.first_name?.trim() || null;
  if (p.last_name !== undefined) profilePayload.last_name = p.last_name?.trim() || null;
  if (p.phone_number !== undefined) profilePayload.phone_number = phoneNumber || null;
  if (p.username !== undefined) profilePayload.username = username || null;
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
  if (Object.keys(profilePayload).length > 0) {
    const { data: existingProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;
    let profileWrite;
    if (existingProfile) {
      profileWrite = await supabase.from('profiles').update(profilePayload).eq('id', authData.user.id);
    } else {
      profileWrite = await supabase.from('profiles').insert({ id: authData.user.id, ...profilePayload });
      if (profileWrite.error?.code === '23505') {
        profileWrite = await supabase.from('profiles').update(profilePayload).eq('id', authData.user.id);
      }
    }
    if (profileWrite.error?.code === '23505' && p.username) {
      throw Object.assign(new Error('That username is already in use. Choose another username.'), { code: profileWrite.error.code });
    }
    if (profileWrite.error) throw profileWrite.error;
  }
  if (Object.keys(userPayload).length > 1) operations.push(supabase.from('users').update(userPayload).eq('id', p.id));
  if (Object.keys(preferencePayload).length > 1) operations.push(supabase.from('user_preferences').update(preferencePayload).eq('user_id', p.id));
  const results = await Promise.all(operations);
  const error = results.find((result: any) => result.error)?.error;
  if (error?.code === '23505' && p.username) {
    throw Object.assign(new Error('That username is already in use. Choose another username.'), { code: error.code });
  }
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
