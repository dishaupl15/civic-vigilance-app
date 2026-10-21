import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import BlueskyShareModal from '../components/reporting/BlueskyShareModal';
import { getBlueskyAvailability, publishIssueToBluesky } from '../lib/blueskyApi';

jest.mock('../lib/blueskyApi', () => ({
  getBlueskyAvailability: jest.fn(),
  publishIssueToBluesky: jest.fn(),
  formatBlueskyPostPreview: (title: string, description: string) => `${title}\n\n${description}\n\n— Civic Vigilance`,
}));

const mockAvailability = jest.mocked(getBlueskyAvailability);
const mockPublish = jest.mocked(publishIssueToBluesky);

beforeEach(() => {
  mockAvailability.mockReset().mockResolvedValue({
    configured: true,
    accountHandle: '@civic.bsky.social',
    migrationReady: true,
    eligible: true,
    alreadyPublished: false,
    reason: 'ready',
  });
  mockPublish.mockReset();
});

test('shows the report and eligible photo, and cancel closes without publishing', async () => {
  const onClose = jest.fn();
  const screen = render(
    <BlueskyShareModal
      visible
      issueId="report-123"
      title="Overflowing roadside waste"
      description="Mixed waste is visible beside the road."
      photoUri="https://storage.example.test/report-photo.jpg"
      onClose={onClose}
    />
  );

  await waitFor(() => expect(screen.getByTestId('publish-bluesky').props.accessibilityState.disabled).toBe(false));
  expect(screen.getByText('@civic.bsky.social · Bluesky')).toBeTruthy();
  expect(screen.getByText(/Overflowing roadside waste/)).toBeTruthy();
  expect(screen.getByLabelText('Photo to be shared publicly')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Cancel Bluesky preview'));

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(mockPublish).not.toHaveBeenCalled();
});