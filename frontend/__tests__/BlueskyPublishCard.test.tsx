import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import BlueskyPublishCard from '../components/reporting/BlueskyPublishCard';
import { getBlueskyAvailability, publishIssueToBluesky } from '../lib/blueskyApi';

jest.mock('../lib/blueskyApi', () => ({
  getBlueskyAvailability: jest.fn(),
  publishIssueToBluesky: jest.fn(),
  formatBlueskyPostPreview: (title: string, description: string) =>
    `${title}\n\n${description}\n\n— Civic Vigilance`,
}));

const mockPublish = jest.mocked(publishIssueToBluesky);
const mockGetAvailability = jest.mocked(getBlueskyAvailability);

const ready = {
  configured: true,
  migrationReady: true,
  eligible: true,
  alreadyPublished: false,
  reason: 'ready',
};

beforeEach(() => {
  mockPublish.mockReset();
  mockGetAvailability.mockReset().mockResolvedValue(ready);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('shows the post and photo preview and waits for explicit confirmation', async () => {
  const screen = render(
    <BlueskyPublishCard
      issueId="report-id"
      title="Overflowing roadside waste"
      description="Mixed waste is visible."
      photoUri="https://storage.example.test/evidence.jpg"
    />
  );
  await waitFor(() => expect(screen.getByTestId('publish-bluesky').props.accessibilityState.disabled).toBe(false));
  expect(screen.getByText(/Overflowing roadside waste/)).toBeTruthy();
  expect(screen.getByLabelText('Photo to be shared publicly')).toBeTruthy();
  expect(screen.getByText(/Official account · Bluesky/)).toBeTruthy();
  expect(screen.getByText(/\/300 characters/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('publish-bluesky'));
  expect(mockPublish).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.press(screen.getByText('Confirm public post'));
    await Promise.resolve();
  });
  expect(mockPublish).toHaveBeenCalledTimes(1);
  expect(mockPublish).toHaveBeenCalledWith('report-id');
});

test('disables publishing while waiting and shows the confirmed post link', async () => {
  let resolvePublication!: (value: { status: 'published'; alreadyPublished: boolean; postUrl: string }) => void;
  mockPublish.mockReturnValue(new Promise((resolve) => { resolvePublication = resolve; }));
  const screen = render(
    <BlueskyPublishCard issueId="report-id" title="Overflowing roadside waste" description="Mixed waste." />
  );
  await waitFor(() => expect(screen.getByTestId('publish-bluesky').props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByTestId('publish-bluesky'));
  await act(async () => {
    fireEvent.press(screen.getByTestId('confirm-bluesky'));
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.getByText('Publishing…')).toBeTruthy());
  fireEvent.press(screen.getByTestId('confirm-bluesky'));
  expect(mockPublish).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolvePublication({
      status: 'published',
      alreadyPublished: false,
      postUrl: 'https://bsky.app/profile/civic.bsky.social/post/postkey',
    });
  });
  expect(screen.getByText('View published Bluesky post')).toBeTruthy();
});

test('shows safe backend failures and an existing publication without retrying', async () => {
  mockPublish.mockRejectedValueOnce(new Error('Bluesky is rate-limiting posts.'));
  const screen = render(
    <BlueskyPublishCard issueId="report-id" title="Overflowing roadside waste" description="Mixed waste." />
  );
  await waitFor(() => expect(screen.getByTestId('publish-bluesky').props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByTestId('publish-bluesky'));
  await act(async () => {
    await act(async () => {
      fireEvent.press(screen.getByText('Confirm public post'));
      await Promise.resolve();
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.getByText('Bluesky is rate-limiting posts.')).toBeTruthy());

  mockPublish.mockResolvedValueOnce({
    status: 'published',
    alreadyPublished: true,
    postUrl: 'https://bsky.app/profile/civic.bsky.social/post/postkey',
  });
  fireEvent.press(screen.getByText('Confirm public post'));
  await waitFor(() => expect(screen.getByText(/already published/)).toBeTruthy());
  expect(screen.getByText('View published Bluesky post')).toBeTruthy();
  expect(mockPublish).toHaveBeenCalledTimes(2);
});

test('keeps the public option visible but disabled for private or unconfigured reports', async () => {
  mockGetAvailability.mockResolvedValueOnce({
    configured: true,
    migrationReady: true,
    eligible: false,
    alreadyPublished: false,
    reason: 'private_report',
  });
  const privateScreen = render(
    <BlueskyPublishCard issueId="private-report" title="Private civic issue" description="Visible details." />
  );
  await waitFor(() => expect(privateScreen.getByText(/Private reports cannot be published publicly/)).toBeTruthy());
  expect(privateScreen.getByTestId('publish-bluesky').props.accessibilityState.disabled).toBe(true);

  mockGetAvailability.mockResolvedValueOnce({
    configured: false,
    migrationReady: false,
    eligible: false,
    alreadyPublished: false,
    reason: 'credentials_missing',
  });
  const unconfiguredScreen = render(
    <BlueskyPublishCard issueId="public-report" title="Public civic issue" description="Visible details." />
  );
  await waitFor(() => expect(unconfiguredScreen.getByText(/official Civic Vigilance Bluesky account is not configured/)).toBeTruthy());
  expect(unconfiguredScreen.getByTestId('publish-bluesky').props.accessibilityState.disabled).toBe(true);
});

test('shows the existing public link instead of an enabled publish action', async () => {
  mockGetAvailability.mockResolvedValueOnce({
    ...ready,
    alreadyPublished: true,
    postUrl: 'https://bsky.app/profile/civic.bsky.social/post/postkey',
  });
  const screen = render(
    <BlueskyPublishCard issueId="published-report" title="Public civic issue" description="Visible details." />
  );
  expect(await screen.findByText('This report has already been published on Bluesky.')).toBeTruthy();
  expect(screen.getByText('View published Bluesky post')).toBeTruthy();
  expect(screen.queryByTestId('publish-bluesky')).toBeNull();
});
