import { fireEvent, render, waitFor } from '@testing-library/react-native';
import NotificationsScreen from '../screens/NotificationsScreen';
import { useAuth } from '../hooks/useAuth';
import { saveProfile } from '../lib/profile';

const mockFrom = jest.fn();
const mockSaveProfile = jest.fn();
const mockRefreshProfile = jest.fn();
const mockBuilder: any = {};
let mockRows = [{
  id: 'notification-1',
  type: 'comment',
  title: 'New comment',
  body: 'Someone commented on your report.',
  read: false,
  created_at: '2026-10-21T10:00:00.000Z',
}];

jest.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  isSupabaseConfigured: true,
}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../hooks/useAuth', () => ({ useAuth: jest.fn() }));
jest.mock('../lib/profile', () => ({ saveProfile: (...args: unknown[]) => mockSaveProfile(...args) }));

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRows = [{
      id: 'notification-1',
      type: 'comment',
      title: 'New comment',
      body: 'Someone commented on your report.',
      read: false,
      created_at: '2026-10-21T10:00:00.000Z',
    }];
    Object.assign(mockBuilder, {
      select: jest.fn(() => mockBuilder),
      eq: jest.fn(() => mockBuilder),
      order: jest.fn(() => mockBuilder),
      limit: jest.fn(async () => ({ data: mockRows, error: null })),
      update: jest.fn(() => mockBuilder),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    });
    mockFrom.mockReturnValue(mockBuilder);
    mockSaveProfile.mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue({
      profile: {
        uid: 'user-123',
        preferences: {
          notifications: {
            nearby: true,
            comments: true,
            upvotes: true,
            replies: true,
            twitter: false,
            digest: true,
            trending: false,
            similar: true,
          },
        },
      },
      refreshProfile: mockRefreshProfile,
      isGuest: false,
    } as any);
  });

  it('loads the current user notification and persists its read state', async () => {
    const screen = render(<NotificationsScreen />);

    expect(await screen.findByText('New comment')).toBeTruthy();
    expect(screen.getByText('1 unread')).toBeTruthy();
    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(mockBuilder.eq).toHaveBeenCalledWith('user_id', 'user-123');

    fireEvent.press(screen.getByText('New comment'));
    await waitFor(() => expect(mockBuilder.update).toHaveBeenCalledWith({ read: true }));
    expect(mockBuilder.eq).toHaveBeenCalledWith('id', 'notification-1');
    expect(screen.getByText('Your latest account activity')).toBeTruthy();
  });

  it('persists notification preference toggles to the user profile', async () => {
    const screen = render(<NotificationsScreen />);
    await screen.findByText('New comment');
    fireEvent(screen.getAllByRole('switch')[0], 'valueChange', false);

    await waitFor(() => expect(mockSaveProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: 'user-123',
      preferences: expect.objectContaining({
        notifications: expect.objectContaining({ comments: false }),
      }),
    })));
    expect(mockRefreshProfile).toHaveBeenCalled();
  });
});