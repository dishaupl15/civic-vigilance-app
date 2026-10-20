import React from 'react';
import { render } from '@testing-library/react-native';
import { Root } from '../App';

jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => (
    require('react').createElement(require('react').Fragment, null, children)
  ),
  DefaultTheme: {},
  DarkTheme: {},
}));
jest.mock('@react-navigation/native-stack', () => {
  const ReactRuntime = require('react');
  const TextComponent = require('react-native').Text;
  const Screen = ({ name }: { name: string }) => ReactRuntime.createElement(TextComponent, null, name);
  const Navigator = ({ children }: { children: React.ReactNode }) => (
    ReactRuntime.createElement(ReactRuntime.Fragment, null, children)
  );
  return { createNativeStackNavigator: () => ({ Navigator, Screen }) };
});
jest.mock('@react-navigation/bottom-tabs', () => {
  const ReactRuntime = require('react');
  const TextComponent = require('react-native').Text;
  const Screen = ({ name }: { name: string }) => ReactRuntime.createElement(TextComponent, null, name);
  const Navigator = ({ children }: { children: React.ReactNode }) => (
    ReactRuntime.createElement(ReactRuntime.Fragment, null, children)
  );
  return { createBottomTabNavigator: () => ({ Navigator, Screen }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../screens/LoginScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/SignupScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/ForgotPasswordScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/UsernameSelectionScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/FeedScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/PostDetailScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/ReportIssueScreenV2', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/ProfileScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/SettingsScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/MyReportsScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/NotificationsScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/PolicyScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/DebugScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/TermsOfServiceScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/PrivacyPolicyScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../screens/UpdatePasswordScreen', () => ({ __esModule: true, default: () => null }));

const mockUseAuth = jest.requireMock('../hooks/useAuth').useAuth;

describe('authenticated route protection', () => {
  test('shows authentication routes when no session exists', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      profile: null,
      isLoading: false,
      isPasswordRecovery: false,
      authCallbackError: null,
      clearAuthCallbackError: jest.fn(),
    });

    const screen = render(<Root />);

    expect(screen.getByText('Auth')).toBeTruthy();
    expect(screen.queryByText('AppTabs')).toBeNull();
  });

  test('shows app routes only after an authenticated session exists', () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: 'user-123', email: 'user@example.org' } },
      profile: { id: 'user-123', username: 'civic-user', full_name: 'Civic User' },
      isLoading: false,
      isPasswordRecovery: false,
      authCallbackError: null,
      clearAuthCallbackError: jest.fn(),
    });

    const screen = render(<Root />);

    expect(screen.getByText('AppTabs')).toBeTruthy();
    expect(screen.queryByText('Auth')).toBeNull();
  });
});
