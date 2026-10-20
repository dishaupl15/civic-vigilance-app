import { loadProfile, saveProfile } from '../lib/profile';

const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn();
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
  isSupabaseConfigured: true,
}));
jest.mock('../lib/storage', () => ({
  resolvePhotoUrls: jest.fn(async (urls: string[]) => urls),
}));

describe('profile persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockImplementation(async () => ({ data: null, error: null }));
    mockSelectEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockSelectEq });
    mockUpsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({
      select: mockSelect,
      upsert: mockUpsert,
    }));
  });

  test('returns a non-authenticating empty profile when records are absent', async () => {
    await expect(loadProfile('authenticated-user-id')).resolves.toEqual({ id: 'authenticated-user-id' });
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockFrom).toHaveBeenCalledWith('users');
  });

  test('retrieves an existing public profile without requiring an application users row', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'authenticated-user-id', full_name: 'Civic Citizen', username: 'civic_user' },
      error: null,
    });

    await expect(loadProfile('authenticated-user-id')).resolves.toMatchObject({
      id: 'authenticated-user-id',
      full_name: 'Civic Citizen',
      username: 'civic_user',
    });
  });

  test('creates or updates the caller profile idempotently on save', async () => {
    mockMaybeSingle.mockImplementation(async () => ({
      data: { id: 'authenticated-user-id', full_name: 'Civic Citizen' },
      error: null,
    }));

    await saveProfile({ id: 'authenticated-user-id', full_name: 'Civic Citizen' });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'authenticated-user-id',
        full_name: 'Civic Citizen',
      }),
      { onConflict: 'id' },
    );
  });

  test('surfaces profile upsert errors', async () => {
    const writeError = { message: 'profile write denied' };
    mockUpsert.mockResolvedValue({ error: writeError });

    await expect(saveProfile({
      id: 'authenticated-user-id',
      full_name: 'Civic Citizen',
    })).rejects.toEqual(writeError);
  });
});
