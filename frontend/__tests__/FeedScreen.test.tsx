import React from 'react';
import { FlatList } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import FeedScreen from '../screens/FeedScreen';

const mockUseIssues = jest.fn();

jest.mock('../hooks/useIssues', () => ({
  useIssues: (...args: unknown[]) => mockUseIssues(...args),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}));
jest.mock('../components/Header', () => () => null);
jest.mock('../components/SortBar', () => () => null);
jest.mock('../components/EnhancedIssueCard', () => () => null);

describe('FeedScreen report states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows the report failure and retry instead of a successful empty state', () => {
    const retry = jest.fn();
    mockUseIssues.mockReturnValue({
      data: [],
      loading: false,
      error: 'Could not load reports. Please try again.',
      retry,
    });
    const screen = render(<FeedScreen />);

    expect(screen.getByText('Could not load reports. Please try again.')).toBeTruthy();
    expect(screen.queryByText('Quiet Neighborhood')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Retry loading reports' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  test('shows the empty state only after a successful empty response', () => {
    mockUseIssues.mockReturnValue({ data: [], loading: false, error: null, retry: jest.fn() });
    const screen = render(<FeedScreen />);

    expect(screen.getByText('Quiet Neighborhood')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry loading reports' })).toBeNull();
  });

  test('pull-to-refresh reloads the feed', () => {
    const retry = jest.fn();
    mockUseIssues.mockReturnValue({
      data: [{ id: 'issue-1' }],
      loading: false,
      error: null,
      retry,
    });
    const screen = render(<FeedScreen />);
    const list = screen.UNSAFE_getByType(FlatList);

    expect(list.props.refreshing).toBe(false);
    list.props.onRefresh();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
