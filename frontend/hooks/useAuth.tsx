/**
 * Authentication Hook - Supabase
 *
 * Core Functionality:
 * - Handles user authentication with Supabase
 * - Manages auth state across the app
 * - Provides sign in, sign up, and sign out methods
 *
 * This hook is optimized for the Civic Vigilance app's core mission:
 * connecting citizens with civic authorities via GPS-tagged reports.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { User as ProfileUser } from '../types';
import * as Crypto from 'expo-crypto';
import { getBackend } from '../lib/backend';
import { currentUserLocal, initAuth, signInLocal, signOutLocal, signUpLocal } from '../lib/sqliteAuth';
import { loadProfile } from '../lib/profile';
import { sha256 } from 'js-sha256';
import {
  createAuthCallbackHandler,
  getAuthRedirectUrl,
  parseAuthCallbackUrl,
} from '../lib/authCallback';
import { validateEmail } from '../lib/authValidation';

const PASSWORD_RECOVERY_KEY = 'auth_password_recovery_pending';
const CALLBACK_FAILURE_MESSAGE =
  'This authentication link is invalid, expired, or already used. Request a new link and try again.';
const SIGN_OUT_FAILURE_MESSAGE = 'Could not sign out. Please try again.';

function getAuthRedirectRuntime() {
  return {
    platform: Platform.OS === 'web' ? 'web' as const : 'native' as const,
    isDevelopment: __DEV__,
    webOrigin: Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : undefined,
  };
}

// User Session type (Auth User)
interface AuthUser {
  id: string;
  email: string | null;
}

interface SimpleSession {
  user: AuthUser;
}

type AuthSession = SimpleSession | null;

interface SignupResponseData {
  session: unknown;
  user?: { identities?: unknown[] | null } | null;
}

interface AuthContextType {
  session: AuthSession;
  profile: ProfileUser | null;
  isLoading: boolean;
  isGuest: boolean;
  isPasswordRecovery: boolean;
  authCallbackError: string | null;
  signIn: (email: string, password: string) => Promise<{ error?: string; code?: string } | undefined>;
  signInAsGuest: () => Promise<{ error?: string; code?: string } | undefined>;
  signUp: (email: string, password: string) => Promise<{ data?: SignupResponseData; error?: string; code?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string; code?: string } | undefined>;
  updatePassword: (password: string) => Promise<{ error?: string; code?: string } | undefined>;
  cancelPasswordRecovery: () => Promise<{ error?: string } | undefined>;
  clearAuthCallbackError: () => void;
  signOut: () => Promise<{ error?: string } | undefined>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function authErrorMessage(error: any, fallback: string) {
  const message = String(error?.message || '');
  if (/failed to fetch|network request failed|name_not_resolved|load failed/i.test(message)) {
    return 'Cannot reach the configured authentication server. Check the Supabase project URL or use local development mode.';
  }
  return message || fallback;
}

/**
 * AuthProvider Component
 *
 * Manages authentication state using Supabase Auth.
 * Listens to auth state changes and updates the session accordingly.
 *
 * Features:
 * - Works on web, iOS, and Android
 * - Built-in security and scalability
 * - Google OAuth support
 * - PostgreSQL backend with PostGIS
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>(null);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [authCallbackError, setAuthCallbackError] = useState<string | null>(null);
  const authEventVersion = useRef(0);
  const currentAuthUserId = useRef<string | null>(null);
  const signOutInProgress = useRef(false);
  const callbackCount = useRef(0);
  const handledCallbackFingerprints = useRef(new Set<string>());
  const authInitializationDone = useRef(false);
  const callbackHandler = useRef<ReturnType<typeof createAuthCallbackHandler> | null>(null);

  // Helper to fetch profile
  const fetchProfile = async (userId: string) => {
    try {
      return await loadProfile(userId) as ProfileUser;
    } catch (e) {
      console.error('[Auth] Exception fetching profile:', e);
      return null;
    }
  };

  const clearRecoveryMarker = async (userId?: string) => {
    try {
      const pendingUserId = await AsyncStorage.getItem(PASSWORD_RECOVERY_KEY);
      if (pendingUserId && (!userId || pendingUserId === userId)) {
        await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
      }
    } catch {
      // Session state remains authoritative if local recovery metadata cannot be cleared.
    }
  };

  useEffect(() => {
    if (getBackend() === 'sqlite') {
      let active = true;
      void (async () => {
        await initAuth();
        const localUser = await currentUserLocal();
        if (active && localUser) {
          setSession({ user: { id: String(localUser.id), email: localUser.email } });
          setProfile({ id: String(localUser.id), username: localUser.email.split('@')[0], full_name: localUser.email.split('@')[0] } as any);
        }
        if (active) setIsLoading(false);
      })();
      return () => { active = false; };
    }

    if (!isSupabaseConfigured) {
      console.error('[Auth] Supabase is not configured.');
      setIsLoading(false);
      return;
    }

    let active = true;
    const updateFromSession = (supabaseSession: any) => {
      if (!supabaseSession) {
        currentAuthUserId.current = null;
        setSession(null);
        setProfile(null);
        return;
      }
      const authUser = {
        id: supabaseSession.user.id,
        email: supabaseSession.user.email ?? null,
      };
      currentAuthUserId.current = authUser.id;
      const eventVersion = authEventVersion.current;
      setSession({ user: authUser });
      void fetchProfile(authUser.id).then((userProfile) => {
        if (active && authEventVersion.current === eventVersion) setProfile(userProfile);
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, supabaseSession: any) => {
      const signedOutUserId = event === 'SIGNED_OUT' ? currentAuthUserId.current : null;
      authEventVersion.current += 1;
      if (supabaseSession) {
        updateFromSession(supabaseSession);
      } else {
        updateFromSession(null);
      }
      if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
        if (signedOutUserId) void clearRecoveryMarker(signedOutUserId);
      }
    });

    callbackHandler.current = createAuthCallbackHandler({
      exchangeCodeForSession: async (code) => {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        return { error, redirectType: data?.redirectType };
      },
      verifyOtp: async (tokenHash, type) => {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        return { error };
      },
      setSession: async (accessToken, refreshToken) => {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return { error };
      },
    }, getAuthRedirectRuntime());

    const processCallback = async (rawUrl: string) => {
      const callbackRuntime = getAuthRedirectRuntime();
      const parsed = parseAuthCallbackUrl(rawUrl, callbackRuntime);
      if (!parsed) return;

      const fingerprint = sha256(rawUrl);
      if (handledCallbackFingerprints.current.has(fingerprint)) return;
      handledCallbackFingerprints.current.add(fingerprint);
      if (handledCallbackFingerprints.current.size > 20) {
        const oldest = handledCallbackFingerprints.current.values().next().value;
        if (oldest) handledCallbackFingerprints.current.delete(oldest);
      }

      authEventVersion.current += 1;
      callbackCount.current += 1;
      setIsLoading(true);
      setAuthCallbackError(null);

      try {
        const result = await callbackHandler.current?.(rawUrl);
        if (result === 'recovery') {
          const authVersionBeforeSessionCheck = authEventVersion.current;
          const { data, error } = await supabase.auth.getSession();
          const recoveryUserId = data.session?.user?.id;
          if (error) throw new Error(CALLBACK_FAILURE_MESSAGE);
          if (!recoveryUserId) {
            setIsPasswordRecovery(false);
            await clearRecoveryMarker(currentAuthUserId.current ?? undefined);
            throw new Error(CALLBACK_FAILURE_MESSAGE);
          }
          if (
            authEventVersion.current !== authVersionBeforeSessionCheck
            && currentAuthUserId.current !== recoveryUserId
          ) {
            throw new Error(CALLBACK_FAILURE_MESSAGE);
          }
          await AsyncStorage.setItem(PASSWORD_RECOVERY_KEY, recoveryUserId).catch(() => undefined);
          setIsPasswordRecovery(true);
        } else if (result === 'confirmed') {
          setIsPasswordRecovery(false);
          await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY).catch(() => undefined);
          Alert.alert(
            'Email verified',
            'Your email has been confirmed. You can now sign in or continue if you are already signed in.'
          );
        }
      } catch {
        setAuthCallbackError(CALLBACK_FAILURE_MESSAGE);
      } finally {
        if (callbackRuntime.platform === 'web' && typeof window !== 'undefined') {
          window.history.replaceState(window.history.state, '', window.location.pathname);
        }
        callbackCount.current -= 1;
        if (active && authInitializationDone.current && callbackCount.current === 0) setIsLoading(false);
      }
    };

    const urlSubscription = Linking.addEventListener('url', ({ url }) => {
      void processCallback(url);
    });

    const restoreSession = async () => {
      const initialSessionVersion = authEventVersion.current;
      try {
        const [sessionResponse, recoveryPending] = await Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem(PASSWORD_RECOVERY_KEY),
        ]);
        if (sessionResponse.error) throw sessionResponse.error;
        const supabaseSession = sessionResponse.data.session;
        if (!active || authEventVersion.current !== initialSessionVersion) return;

        if (supabaseSession) {
          currentAuthUserId.current = supabaseSession.user.id;
          setSession({
            user: {
              id: supabaseSession.user.id,
              email: supabaseSession.user.email ?? null,
            },
          });
          const recoveryBelongsToSession = recoveryPending === supabaseSession.user.id;
          setIsPasswordRecovery(recoveryBelongsToSession);
          if (recoveryPending && !recoveryBelongsToSession) {
            await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY).catch(() => undefined);
          }
          const userProfile = await fetchProfile(supabaseSession.user.id);
          if (active && authEventVersion.current === initialSessionVersion) setProfile(userProfile);
        } else {
          currentAuthUserId.current = null;
          setSession(null);
          setProfile(null);
          setIsPasswordRecovery(false);
          await clearRecoveryMarker();
        }
      } catch {
        if (active && authEventVersion.current === initialSessionVersion) {
          currentAuthUserId.current = null;
          setSession(null);
          setProfile(null);
        }
      }
    };

    const initialize = async () => {
      const browserUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.href
        : null;
      const initialUrl = (await Linking.getInitialURL().catch(() => null)) ?? browserUrl;
      if (initialUrl) await processCallback(initialUrl);
      await restoreSession();
      authInitializationDone.current = true;
      if (active && callbackCount.current === 0) setIsLoading(false);
    };
    void initialize();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onBrowserLocationChange = () => {
        void processCallback(window.location.href);
      };
      window.addEventListener('hashchange', onBrowserLocationChange);
      window.addEventListener('popstate', onBrowserLocationChange);

      const cleanupBrowserLocationListeners = () => {
        window.removeEventListener('hashchange', onBrowserLocationChange);
        window.removeEventListener('popstate', onBrowserLocationChange);
      };

      return () => {
        active = false;
        callbackHandler.current = null;
        urlSubscription.remove();
        subscription.unsubscribe();
        cleanupBrowserLocationListeners();
      };
    }

    return () => {
      active = false;
      callbackHandler.current = null;
      urlSubscription.remove();
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Memoized authentication methods
   *
   * These methods handle Supabase authentication with proper error handling.
   * All errors are caught and returned in a user-friendly format.
   */
  const value = useMemo<AuthContextType>(() => ({
    session,
    profile,
    isLoading,
    isGuest: session?.user?.email === '__guest__',
    isPasswordRecovery,
    authCallbackError,

    refreshProfile: async () => {
      if (session?.user.id) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      }
    },

    /**
     * Sign in as guest with a unique anonymous session
     * No hardcoded credentials - generates a random UUID-based identity
     */
    signInAsGuest: async () => {
      const guestId = `guest-${Crypto.randomUUID()}`;

      setSession({ user: { id: guestId, email: '__guest__' } });
      setProfile({
        id: guestId,
        username: 'Guest_User',
        full_name: 'Guest User',
        email: '__guest__',
        anonymousMode: false,
        stats: { totalPosts: 5, totalUpvotes: 34, totalComments: 12, totalShares: 8 },
        createdAt: new Date(),
        lastLoginAt: new Date(),
        googleConnected: false,
        twitterConnected: false,
        privacyDefault: 'twitter',
        alwaysAskTwitterMethod: true,
        isVerified: false,
        preferences: {
          notifications: {
            nearby: false, comments: false, upvotes: false, replies: false,
            twitter: false, digest: false, trending: false, similar: false,
          },
        },
        privacySettings: { profileVisibility: 'public', showLocation: true },
      } as any);

      return undefined;
    },

    /**
     * Sign in with email and password
     *
     * @param email - User's email address
     * @param password - User's password
     * @returns Error object if sign in fails, undefined if successful
     */
    signIn: async (email: string, password: string) => {
      // Guest mode check - triggered from "Try Demo" button
      if (email === '__guest__') {
        const guestId = `guest-${Crypto.randomUUID()}`;

        setSession({ user: { id: guestId, email: '__guest__' } });
        setProfile({
          id: guestId,
          username: 'Guest_User',
          full_name: 'Guest User',
          email: '__guest__',
          anonymousMode: false,
          stats: { totalPosts: 5, totalUpvotes: 34, totalComments: 12, totalShares: 8 },
          createdAt: new Date(),
          lastLoginAt: new Date(),
          googleConnected: false,
          twitterConnected: false,
          privacyDefault: 'twitter',
          alwaysAskTwitterMethod: true,
          isVerified: false,
          preferences: {
            notifications: {
              nearby: false, comments: false, upvotes: false, replies: false,
              twitter: false, digest: false, trending: false, similar: false,
            },
          },
          privacySettings: { profileVisibility: 'public', showLocation: true },
        } as any);

        return undefined;
      }

      if (getBackend() === 'sqlite') {
        const result = await signInLocal(email.trim().toLowerCase(), password);
        if (result.error || !result.user) return { error: result.error || 'Failed to sign in', code: 'auth/local-error' };
        setSession({ user: { id: String(result.user.id), email: result.user.email } });
        setProfile({ id: String(result.user.id), username: result.user.email.split('@')[0], full_name: result.user.email.split('@')[0] } as any);
        return undefined;
      }

      if (!isSupabaseConfigured) {
        return { error: 'Supabase Auth not initialized', code: 'auth/not-initialized' };
      }

      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });

        if (error) {
          const errorMessage = String(error.message || '');
          if (/email not confirmed/i.test(errorMessage)) {
            return {
              error: 'Sign-in unsuccessful. Check your email and password, then try again.',
              code: error.status?.toString() || 'auth/email-not-confirmed',
            };
          }
          return {
            error: errorMessage || 'Failed to sign in',
            code: error.status?.toString() || 'auth/unknown-error',
          };
        }

        if (!data?.session?.user?.id) {
          return {
            error: 'Sign-in did not establish an active session. Please try again.',
            code: 'auth/no-session',
          };
        }

        // Session will be updated by onAuthStateChange listener
        return undefined;
      } catch (error: any) {
        return {
          error: authErrorMessage(error, 'Failed to sign in'),
          code: 'auth/unknown-error',
        };
      }
    },

    /**
     * Sign up with email and password
     *
     * @param email - User's email address
     * @param password - User's password (minimum 8 characters)
     * @returns Error object if sign up fails, undefined if successful
     */
    signUp: async (email: string, password: string) => {
      if (getBackend() === 'sqlite') {
        const result = await signUpLocal(email.trim().toLowerCase(), password, email.split('@')[0]);
        if (result.error || !result.user) return { error: result.error || 'Failed to create local account', code: 'auth/local-error' };
        const localSession = { user: { id: String(result.user.id), email: result.user.email } };
        setSession(localSession);
        setProfile({ id: String(result.user.id), username: result.user.email.split('@')[0], full_name: result.user.email.split('@')[0] } as any);
        return { data: { session: localSession } };
      }

      if (!isSupabaseConfigured) {
        return { error: 'Supabase Auth not initialized', code: 'auth/not-initialized' };
      }

      try {
        const emailRedirectTo = getAuthRedirectUrl(getAuthRedirectRuntime());
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { emailRedirectTo },
        });

        if (error) {
          return {
            data,
            error: error.message || 'Failed to sign up',
            code: error.status?.toString() || 'auth/unknown-error',
          };
        }

        // Session will be updated by onAuthStateChange listener
        return { data };
      } catch (error: any) {
        return {
          error: authErrorMessage(error, 'Failed to sign up'),
          code: 'auth/unknown-error',
        };
      }
    },

    /**
     * Send password reset email
     *
     * @param email - User's email address
     * @returns Error object if request fails, undefined if successful
     */
    resetPassword: async (email: string) => {
      const emailError = validateEmail(email);
      if (emailError) return { error: emailError, code: 'auth/invalid-email' };
      if (getBackend() === 'sqlite') {
        return { error: 'Password recovery is unavailable for local accounts.', code: 'auth/local-unsupported' };
      }
      if (!isSupabaseConfigured) {
        return { error: 'Supabase Auth not initialized', code: 'auth/not-initialized' };
      }

      try {
        const redirectTo = getAuthRedirectUrl(getAuthRedirectRuntime());
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo,
        });

        if (error) {
          return {
            error: error.message || 'Failed to send reset email',
            code: error.status?.toString() || 'auth/unknown-error',
          };
        }

        return undefined;
      } catch (error: any) {
        console.error('[Auth] Reset password error:', error);
        return {
          error: authErrorMessage(error, 'Failed to send reset email'),
          code: 'auth/unknown-error',
        };
      }
    },

    updatePassword: async (password: string) => {
      if (getBackend() === 'sqlite') {
        return { error: 'Password updates are unavailable for local accounts.', code: 'auth/local-unsupported' };
      }
      if (!isSupabaseConfigured) {
        return { error: 'Supabase Auth is not initialized.', code: 'auth/not-initialized' };
      }
      try {
        const { data, error } = await supabase.auth.updateUser({ password });
        if (error) return { error: error.message || 'Failed to update password', code: error.status?.toString() || 'auth/unknown-error' };
        if (!data.user) return { error: 'The password update was not confirmed. Please try again.', code: 'auth/no-user' };
        setIsPasswordRecovery(false);
        await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
        return undefined;
      } catch (error: any) {
        return {
          error: authErrorMessage(error, 'Failed to update password'),
          code: 'auth/unknown-error',
        };
      }
    },

    cancelPasswordRecovery: async () => {
      if (getBackend() === 'sqlite') {
        setIsPasswordRecovery(false);
        return undefined;
      }
      try {
        const { error } = await supabase.auth.signOut();
        if (error) return { error: error.message || 'Could not safely leave password recovery.' };
        setIsPasswordRecovery(false);
        await AsyncStorage.removeItem(PASSWORD_RECOVERY_KEY);
        return undefined;
      } catch (error: any) {
        return { error: authErrorMessage(error, 'Could not safely leave password recovery.') };
      }
    },

    clearAuthCallbackError: () => setAuthCallbackError(null),

    /**
     * Sign out current user
     */
    signOut: async () => {
      if (signOutInProgress.current) {
        return { error: 'Logout is already in progress. Please wait.' };
      }
      signOutInProgress.current = true;
      try {
        if (getBackend() === 'sqlite') {
          await signOutLocal();
          setSession(null);
          setProfile(null);
          setIsPasswordRecovery(false);
          return undefined;
        }
        if (!isSupabaseConfigured) {
          return { error: 'Authentication is not initialized. Please try again later.' };
        }

        const initialAuthEventVersion = authEventVersion.current;
        const signedOutUserId = currentAuthUserId.current ?? session?.user.id ?? null;
        const { error } = await supabase.auth.signOut();
        if (error) return { error: SIGN_OUT_FAILURE_MESSAGE };

        if (signedOutUserId) {
          await clearRecoveryMarker(signedOutUserId);
        } else if (authEventVersion.current === initialAuthEventVersion) {
          await clearRecoveryMarker();
        }
        if (authEventVersion.current === initialAuthEventVersion) {
          setIsPasswordRecovery(false);
          currentAuthUserId.current = null;
          setSession(null);
          setProfile(null);
        }
        return undefined;
      } catch {
        return { error: SIGN_OUT_FAILURE_MESSAGE };
      } finally {
        signOutInProgress.current = false;
      }
    },
  }), [session, profile, isLoading, isPasswordRecovery, authCallbackError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth Hook
 *
 * Access authentication state and methods from any component.
 * Must be used within an AuthProvider component.
 *
 * @example
 * ```typescript
 * const { session, profile, signIn, signOut } = useAuth();
 *
 * if (session) {
 *   // User is logged in
 *   console.log('User ID:', session.user.id);
 *   console.log('Username:', profile?.username);
 * }
 * ```
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider component');
  }

  return context;
}
