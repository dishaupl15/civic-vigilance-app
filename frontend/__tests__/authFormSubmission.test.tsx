import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../lib/backend', () => ({
  getBackend: () => 'supabase',
}));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: require('react-native').View,
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

const mockUseAuth = jest.requireMock('../hooks/useAuth').useAuth;

describe('authentication form submission guards', () => {
  test('does not start concurrent login requests from rapid repeated taps', async () => {
    let finishSignIn!: () => void;
    const signIn = jest.fn(
      () => new Promise<void>((resolve) => { finishSignIn = resolve; }),
    );
    mockUseAuth.mockReturnValue({ signIn, signInAsGuest: jest.fn() });
    const screen = render(<LoginScreen navigation={{ navigate: jest.fn() }} />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.org');
    fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1');

    act(() => {
      fireEvent.press(screen.getByText('Sign In'));
      fireEvent.press(screen.getByText('Sign In'));
    });

    expect(signIn).toHaveBeenCalledTimes(1);
    await act(async () => finishSignIn());
  });

  test('does not start concurrent signup requests from rapid repeated taps', async () => {
    let finishSignUp!: () => void;
    const signUp = jest.fn(
      () => new Promise<{ data: { session: object } }>((resolve) => {
        finishSignUp = () => resolve({ data: { session: {} } });
      }),
    );
    mockUseAuth.mockReturnValue({ signUp });
    const screen = render(<SignupScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.org');
    fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'StrongPass1');

    act(() => {
      fireEvent.press(screen.getByText('Sign up'));
      fireEvent.press(screen.getByText('Sign up'));
    });

    expect(signUp).toHaveBeenCalledTimes(1);
    await act(async () => finishSignUp());
  });

  test('does not show confirmation-pending UI when signup returns a session', async () => {
    mockUseAuth.mockReturnValue({
      signUp: jest.fn().mockResolvedValue({
        data: { user: { identities: [{}] }, session: { user: { id: 'user-123' } } },
      }),
    });
    const screen = render(<SignupScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.org');
    fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'StrongPass1');

    await act(async () => {
      fireEvent.press(screen.getByText('Sign up'));
    });

    expect(screen.queryByText('Resend confirmation email')).toBeNull();
    expect(screen.queryByText(/your account is not active/i)).toBeNull();
  });

  test('does not claim signup succeeded when Supabase returns no session', async () => {
    mockUseAuth.mockReturnValue({
      signUp: jest.fn().mockResolvedValue({
        data: { user: { identities: [{}] }, session: null },
      }),
    });
    const screen = render(<SignupScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.org');
    fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'StrongPass1');

    await act(async () => {
      fireEvent.press(screen.getByText('Sign up'));
    });

    expect(screen.getByText(/did not return an active session/i)).toBeTruthy();
    expect(screen.queryByText(/check your email/i)).toBeNull();
    expect(screen.queryByText(/verify your email/i)).toBeNull();
  });

  test('shows a safe existing-account message without confirmation prompts', async () => {
    const signUp = jest.fn().mockResolvedValue({
      data: { user: { identities: [] }, session: null },
    });
    mockUseAuth.mockReturnValue({ signUp });
    const screen = render(<SignupScreen />);
    fireEvent.changeText(screen.getByLabelText('Email'), 'user@example.org');
    fireEvent.changeText(screen.getByLabelText('Password'), 'StrongPass1');
    fireEvent.changeText(screen.getByLabelText('Confirm password'), 'StrongPass1');

    await act(async () => {
      fireEvent.press(screen.getByText('Sign up'));
    });

    expect(screen.getByText(/An account with this email already exists/i)).toBeTruthy();
    expect(screen.queryByText(/check your email/i)).toBeNull();
    expect(screen.queryByText(/verify your email/i)).toBeNull();
    expect(screen.queryByText('Resend confirmation email')).toBeNull();
  });
});
