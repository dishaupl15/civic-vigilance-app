import { Alert, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { shareViaSheet, showShareDialog } from '../lib/sharingEnhanced';

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn() }));
jest.mock('expo-linking', () => ({}));
jest.mock('expo-file-system', () => ({}));

afterEach(() => {
  jest.restoreAllMocks();
});

test('adds Bluesky to the existing share menu and opens its supplied preview action', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const onBluesky = jest.fn();

  showShareDialog({ text: 'Civic report' }, undefined, onBluesky);

  const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
  const blueskyOption = buttons.find((button) => button.text === '🦋 Bluesky');
  expect(blueskyOption).toBeDefined();
  expect(buttons.map((button) => button.text)).toEqual(expect.arrayContaining([
    '🐦 Twitter', '💬 WhatsApp', '📸 Instagram', '📘 Facebook', '📤 More Options',
  ]));
  blueskyOption?.onPress?.();
  expect(onBluesky).toHaveBeenCalledTimes(1);
});

test('keeps the existing share menu unchanged when no Bluesky action is provided', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  showShareDialog({ text: 'Civic report' });

  const buttons = alert.mock.calls[0][2] as Array<{ text: string }>;
  expect(buttons.some((button) => button.text === '🦋 Bluesky')).toBe(false);
  expect(buttons.map((button) => button.text)).toContain('🐦 Twitter');
});

test('opens the native share sheet for text-only More Options', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });

  await expect(shareViaSheet({ text: 'A civic report' })).resolves.toBe(true);
  expect(share).toHaveBeenCalledWith({
    title: 'Share Civic Vigilance report',
    message: 'A civic report',
  });
});