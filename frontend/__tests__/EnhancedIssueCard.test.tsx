import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import EnhancedIssueCard from '../components/EnhancedIssueCard';
import { IssueWithUserData } from '../types';
import { castVote, getUserVote } from '../lib/votes';
import { composePostText, showShareDialog } from '../lib/sharingEnhanced';

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    isGuest: false,
    signOut: jest.fn(),
    session: { user: { id: 'user-1' } },
  }),
}));
jest.mock('../lib/votes', () => ({
  castVote: jest.fn(),
  getUserVote: jest.fn(),
}));
jest.mock('../lib/sharingEnhanced', () => ({
  composePostText: jest.fn(() => 'Share this report'),
  showShareDialog: jest.fn(),
}));

const issue: IssueWithUserData = {
  id: 'issue-1',
  userId: 'user-1',
  title: 'Broken streetlight',
  description: 'The lamp is not working.',
  category: 'other',
  photos: [],
  address: 'Main Street',
  upvotes: 5,
  downvotes: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('EnhancedIssueCard actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getUserVote as jest.Mock).mockResolvedValue({ status: 'ready', vote: 0, hasVote: false });
  });

  test('shares the real report details through the existing share dialog', async () => {
    const screen = render(<EnhancedIssueCard item={issue} />);

    await waitFor(() => expect(screen.getByTestId('upvote-issue-1').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByTestId('share-issue-1'), { stopPropagation: jest.fn() });

    expect(showShareDialog).toHaveBeenCalledWith({
      text: 'Share this report',
      imageUri: undefined,
    });
    expect(composePostText).toHaveBeenCalledWith({
      title: 'Broken streetlight',
      description: 'The lamp is not working.',
      address: 'Main Street',
      lat: undefined,
      lng: undefined,
      category: 'other',
    });
  });

  test('saves and removes an upvote, reflecting server totals', async () => {
    (castVote as jest.Mock)
      .mockResolvedValueOnce({ vote: 1, upvotes: 6, downvotes: 2 })
      .mockResolvedValueOnce({ vote: 0, upvotes: 5, downvotes: 2 });
    const screen = render(<EnhancedIssueCard item={issue} />);
    const upvote = screen.getByTestId('upvote-issue-1');

    await waitFor(() => expect(upvote.props.accessibilityState.disabled).toBe(false));
    fireEvent.press(upvote, { stopPropagation: jest.fn() });
    await waitFor(() => expect(screen.getByText('6')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('upvote-issue-1').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByTestId('upvote-issue-1'), { stopPropagation: jest.fn() });
    await waitFor(() => expect(castVote).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('5')).toBeTruthy());

    expect(castVote).toHaveBeenNthCalledWith(1, 'issue-1', 1);
    expect(castVote).toHaveBeenNthCalledWith(2, 'issue-1', 1);
  });

  test('replaces its displayed vote total when refreshed issue data changes', async () => {
    const screen = render(<EnhancedIssueCard item={issue} />);
    await waitFor(() => expect(screen.getByTestId('upvote-issue-1').props.accessibilityState.disabled).toBe(false));
    screen.rerender(<EnhancedIssueCard item={{ ...issue, upvotes: 9 }} />);

    await waitFor(() => expect(screen.getByText('9')).toBeTruthy());
  });
});
