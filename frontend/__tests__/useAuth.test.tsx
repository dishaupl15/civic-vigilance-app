import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../hooks/useAuth';
import { AUTH_CALLBACK_URL } from '../lib/authCallback';

const mockSession = {
  user: { id: 'user-123', email: 'user@example.org' },
  access_token: 'mock-access-token',
};
let mockAuthListener: ((event: string, session: typeof mockSession | null) => void) | null = null;
let mockUrlListener: ((event: { url: string }) => void) | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn((callback: typeof mockAuthListener) => {
        mockAuthListener = callback;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      verifyOtp: jest.fn(),
      setSession: jest.fn(),
      updateUser: jest.fn(),
      signOut: jest.fn(),
    },
  },
  isSupabaseConfigured: true,
}));
jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(),
  addEventListener: jest.fn((_event: string, callback: typeof mockUrlListener) => {
    mockUrlListener = callback;
    return { remove: jest.fn() };
  }),
}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/profile', () => ({ loadProfile: jest.fn(() => Promise.resolve(null)) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'mock-uuid' }));
jest.mock('../lib/sqliteAuth', () => ({
  currentUserLocal: jest.fn(),
  initAuth: jest.fn(),
  signInLocal: jest.fn(),
  signOutLocal: jest.fn(),
  signUpLocal: jest.fn(),
}));

const mockSupabaseAuth = jest.requireMock('../lib/supabase').supabase.auth;
const mockLinking = jest.requireMock('expo-linking');

describe('Supabase auth context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLinking.getInitialURL.mockResolvedValue(null);
    mockAuthListener = null;
    mockUrlListener = null;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    mockSupabaseAuth.exchangeCodeForSession.mockReset().mockResolvedValue({
      data: { session: mockSession, redirectType: null },
      error: null,
    });
    mockSupabaseAuth.verifyOtp.mockReset().mockResolvedValue({ error: null });
    mockSupabaseAuth.setSession.mockReset().mockResolvedValue({ error: null });
    mockSupabaseAuth.updateUser.mockReset();
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: { identities: [{}] }, session: null },
      error: null,
    });
    mockSupabaseAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    mockSupabaseAuth.signOut.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_OUT', null);
      return { error: null };
    });
  });

  async function mountAuth() {
    const rendered = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(rendered.result.current.isLoading).toBe(false));
    return rendered;
  }

  test('sends signup and password recovery to the native callback URL', async () => {
    const { result } = await mountAuth();

    await act(async () => {
      await result.current.signUp(' User@example.org ', 'StrongPass1');
      await result.current.resetPassword('user@example.org');
    });

    expect(mockSupabaseAuth.signUp).toHaveBeenCalledWith({
      email: 'user@example.org',
      password: 'StrongPass1',
      options: { emailRedirectTo: AUTH_CALLBACK_URL },
    });
    expect(mockSupabaseAuth.resetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.org',
      { redirectTo: AUTH_CALLBACK_URL },
    );
  });

  test('adopts the authenticated Supabase session returned by signup', async () => {
    mockSupabaseAuth.signUp.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_IN', mockSession);
      return {
        data: { user: mockSession.user, session: mockSession },
        error: null,
      };
    });
    const { result } = await mountAuth();

    await act(async () => {
      const signup = await result.current.signUp('user@example.org', 'StrongPass1');
      expect(signup.data?.session).toEqual(mockSession);
    });

    expect(result.current.session?.user).toEqual({
      id: 'user-123',
      email: 'user@example.org',
    });
  });

  test('does not authenticate when Supabase signup fails', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Signup is unavailable', status: 500 },
    });
    const { result } = await mountAuth();

    await act(async () => {
      await expect(result.current.signUp('user@example.org', 'StrongPass1')).resolves.toMatchObject({
        error: 'Signup is unavailable',
        code: '500',
      });
    });

    expect(result.current.session).toBeNull();
  });

  test('does not authenticate a signup response that has a user but no session', async () => {
    mockSupabaseAuth.signUp.mockResolvedValue({
      data: { user: mockSession.user, session: null },
      error: null,
    });
    const { result } = await mountAuth();

    await act(async () => {
      const signup = await result.current.signUp('user@example.org', 'StrongPass1');
      expect(signup.data?.user).toEqual(mockSession.user);
      expect(signup.data?.session).toBeNull();
    });

    expect(result.current.session).toBeNull();
  });

  test('restores a persisted session and clears it on logout', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();

    expect(result.current.session?.user).toEqual({
      id: 'user-123',
      email: 'user@example.org',
    });

    await act(async () => {
      await expect(result.current.signOut()).resolves.toBeUndefined();
    });

    expect(mockSupabaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(result.current.session).toBeNull();
  });

  test('clears the recovery marker after a successful logout', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('user-123');
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();
    expect(result.current.isPasswordRecovery).toBe(true);

    await act(async () => {
      await expect(result.current.signOut()).resolves.toBeUndefined();
    });

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_password_recovery_pending');
    expect(result.current.session).toBeNull();
    expect(result.current.isPasswordRecovery).toBe(false);
  });

  test('preserves authenticated state when Supabase returns a logout error', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSupabaseAuth.signOut.mockResolvedValue({ error: new Error('private provider detail') });
    const { result } = await mountAuth();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({
        error: 'Could not sign out. Please try again.',
      });
    });

    expect(result.current.session?.user.id).toBe('user-123');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  test('preserves authenticated state when Supabase signOut throws', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSupabaseAuth.signOut.mockRejectedValue(new Error('private provider detail'));
    const { result } = await mountAuth();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({
        error: 'Could not sign out. Please try again.',
      });
    });

    expect(result.current.session?.user.id).toBe('user-123');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  test('keeps auth-state changes authoritative when signOut fails after an external sign-out event', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSupabaseAuth.signOut.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_OUT', null);
      return { error: new Error('private provider detail') };
    });
    const { result } = await mountAuth();

    await act(async () => {
      await expect(result.current.signOut()).resolves.toEqual({
        error: 'Could not sign out. Please try again.',
      });
    });

    expect(result.current.session).toBeNull();
  });

  test('does not issue concurrent logout requests', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    let finishSignOut!: (value: { error: null }) => void;
    mockSupabaseAuth.signOut.mockImplementation(
      () => new Promise((resolve) => { finishSignOut = resolve; }),
    );
    const { result } = await mountAuth();

    let firstLogout!: Promise<{ error?: string } | undefined>;
    await act(async () => {
      firstLogout = result.current.signOut();
      await expect(result.current.signOut()).resolves.toEqual({
        error: 'Logout is already in progress. Please wait.',
      });
      finishSignOut({ error: null });
      await expect(firstLogout).resolves.toBeUndefined();
    });

    expect(mockSupabaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(result.current.session).toBeNull();
  });

  test('routes an SDK-identified PKCE recovery callback into password recovery', async () => {
    mockLinking.getInitialURL.mockResolvedValue(`${AUTH_CALLBACK_URL}?code=mock-code`);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('user-123');
    mockSupabaseAuth.exchangeCodeForSession.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_IN', mockSession);
      return {
        data: { session: mockSession, redirectType: 'recovery' },
        error: null,
      };
    });
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();

    expect(mockSupabaseAuth.exchangeCodeForSession).toHaveBeenCalledWith('mock-code');
    expect(result.current.session?.user.id).toBe('user-123');
    expect(result.current.isPasswordRecovery).toBe(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('auth_password_recovery_pending', 'user-123');
  });

  test('clears recovery state only after Supabase confirms a password update', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('user-123');
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSupabaseAuth.updateUser.mockResolvedValue({
      data: { user: mockSession.user },
      error: null,
    });
    const { result } = await mountAuth();
    expect(result.current.isPasswordRecovery).toBe(true);

    await act(async () => {
      await expect(result.current.updatePassword('StrongPass1')).resolves.toBeUndefined();
    });

    expect(mockSupabaseAuth.updateUser).toHaveBeenCalledWith({ password: 'StrongPass1' });
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_password_recovery_pending');
    expect(result.current.isPasswordRecovery).toBe(false);
  });

  test('handles a foreground callback once', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('user-123');
    mockSupabaseAuth.exchangeCodeForSession.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_IN', mockSession);
      return {
        data: { session: mockSession, redirectType: 'recovery' },
        error: null,
      };
    });
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();
    const callbackUrl = `${AUTH_CALLBACK_URL}?code=foreground-code`;

    await act(async () => {
      mockUrlListener?.({ url: callbackUrl });
      mockUrlListener?.({ url: callbackUrl });
    });
    await waitFor(() => expect(result.current.isPasswordRecovery).toBe(true));

    expect(mockSupabaseAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  test('handles a signup verification callback on cold start and confirms success', async () => {
    mockLinking.getInitialURL.mockResolvedValue(`${AUTH_CALLBACK_URL}?code=signup-confirmation-code`);
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSupabaseAuth.exchangeCodeForSession.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_IN', mockSession);
      return {
        data: { session: mockSession, redirectType: null },
        error: null,
      };
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { result } = await mountAuth();

    expect(mockSupabaseAuth.exchangeCodeForSession).toHaveBeenCalledWith('signup-confirmation-code');
    expect(result.current.session?.user).toEqual({
      id: 'user-123',
      email: 'user@example.org',
    });
    expect(alert).toHaveBeenCalledWith(
      'Email verified',
      expect.stringMatching(/confirmed/i)
    );
    alert.mockRestore();
  });

  test('waits to activate recovery until the recovery session is confirmed', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();
    let confirmRecoverySession!: (value: { data: { session: typeof mockSession }; error: null }) => void;
    mockSupabaseAuth.exchangeCodeForSession.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', mockSession);
      return { data: { session: mockSession, redirectType: 'recovery' }, error: null };
    });
    mockSupabaseAuth.getSession.mockImplementation(
      () => new Promise((resolve) => { confirmRecoverySession = resolve; }),
    );

    await act(async () => {
      mockUrlListener?.({ url: `${AUTH_CALLBACK_URL}?code=pending-session-check` });
    });
    await waitFor(() => expect(mockSupabaseAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1));
    expect(result.current.isPasswordRecovery).toBe(false);

    await act(async () => {
      confirmRecoverySession({ data: { session: mockSession }, error: null });
    });
    await waitFor(() => expect(result.current.isPasswordRecovery).toBe(true));
  });

  test('does not activate recovery when a foreground callback has no session', async () => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('user-123');
    mockSupabaseAuth.exchangeCodeForSession.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', mockSession);
      return { data: { session: mockSession, redirectType: 'recovery' }, error: null };
    });
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await act(async () => {
      mockUrlListener?.({ url: `${AUTH_CALLBACK_URL}?code=missing-session` });
    });
    await waitFor(() => expect(mockSupabaseAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.authCallbackError).toMatch(/invalid, expired/i));

    expect(result.current.isPasswordRecovery).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      'auth_password_recovery_pending',
      expect.any(String),
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('auth_password_recovery_pending');
  });

  test.each([
    ['returns an error', async () => ({ data: { session: null }, error: new Error('session lookup failed') })],
    ['throws an exception', async () => { throw new Error('session lookup failed'); }],
  ])('does not activate recovery when the session check %s', async (_caseName, getSessionResult) => {
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();
    mockSupabaseAuth.exchangeCodeForSession.mockImplementation(async () => {
      mockAuthListener?.('PASSWORD_RECOVERY', mockSession);
      return { data: { session: mockSession, redirectType: 'recovery' }, error: null };
    });
    mockSupabaseAuth.getSession.mockImplementation(getSessionResult);

    await act(async () => {
      mockUrlListener?.({ url: `${AUTH_CALLBACK_URL}?code=session-check-failure-${_caseName}` });
    });
    await waitFor(() => expect(mockSupabaseAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.authCallbackError).toMatch(/invalid, expired/i));

    expect(result.current.isPasswordRecovery).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      'auth_password_recovery_pending',
      expect.any(String),
    );
  });

  test('preserves a verified recovery state when an unrelated callback fails', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('user-123');
    mockSupabaseAuth.getSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    const { result } = await mountAuth();
    expect(result.current.isPasswordRecovery).toBe(true);
    (AsyncStorage.removeItem as jest.Mock).mockClear();

    await act(async () => {
      mockUrlListener?.({ url: `${AUTH_CALLBACK_URL}?error=access_denied` });
    });
    await waitFor(() => expect(result.current.authCallbackError).toMatch(/invalid, expired/i));

    expect(result.current.isPasswordRecovery).toBe(true);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  test('shows a recoverable callback error for provider error responses', async () => {
    mockLinking.getInitialURL.mockResolvedValue(`${AUTH_CALLBACK_URL}?error=access_denied`);
    const { result } = await mountAuth();

    expect(result.current.authCallbackError).toMatch(/invalid, expired/i);
    expect(mockSupabaseAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('maps unconfirmed-email and invalid-credential responses to safe messages', async () => {
    const { result } = await mountAuth();
    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      error: { message: 'Email not confirmed', status: 400 },
    });
    await expect(result.current.signIn('user@example.org', 'password'))
      .resolves.toMatchObject({ error: expect.stringMatching(/verify your email/i) });

    mockSupabaseAuth.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials', status: 400 },
    });
    await expect(result.current.signIn('user@example.org', 'wrong'))
      .resolves.toMatchObject({ error: 'Invalid login credentials' });
  });

  test('signs in with a confirmed account and adopts the Supabase auth session', async () => {
    mockSupabaseAuth.signInWithPassword.mockImplementation(async () => {
      mockAuthListener?.('SIGNED_IN', mockSession);
      return { error: null };
    });
    const { result } = await mountAuth();

    await act(async () => {
      await expect(result.current.signIn(' User@example.org ', 'StrongPass1')).resolves.toBeUndefined();
    });

    expect(mockSupabaseAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'user@example.org',
      password: 'StrongPass1',
    });
    expect(result.current.session?.user).toEqual({
      id: 'user-123',
      email: 'user@example.org',
    });
  });
});
