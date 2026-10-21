import { loadProfile, saveProfile } from '../lib/profile';

const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn();
const mockSelect = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  },
  isSupabaseConfigured: true,
}));
jest.mock('../lib/storage', () => ({
  resolvePhotoUrls: jest.fn(async (urls: string[]) => urls),
}));

describe('profile persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'authenticated-user-id', email: 'citizen@example.org' } },
      error: null,
    });
    mockMaybeSingle.mockImplementation(async () => ({ data: null, error: null }));
    mockSelectEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockSelectEq });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockUpdateEq });
    mockInsert.mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
    }));
  });

  test('returns an email-linked profile shell when profile records are absent', async () => {
    await expect(loadProfile('authenticated-user-id')).resolves.toEqual({
      id: 'authenticated-user-id',
      email: 'citizen@example.org',
    });
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

  test('updates only the authenticated profile row on save', async () => {
    mockMaybeSingle.mockImplementation(async () => ({
      data: { id: 'authenticated-user-id', full_name: 'Civic Citizen' },
      error: null,
    }));

    await saveProfile({ id: 'authenticated-user-id', full_name: 'Civic Citizen' });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Civic Citizen',
      }),
    );
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'authenticated-user-id');
  });

  test('completes a missing existing-user profile with an Auth-owned ID', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await saveProfile({
      id: 'authenticated-user-id',
      first_name: 'Civic',
      last_name: 'Citizen',
      full_name: 'Civic Citizen',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'authenticated-user-id',
      first_name: 'Civic',
      last_name: 'Citizen',
      full_name: 'Civic Citizen',
    }));
  });

  test('rejects profile reads and writes for a different Auth user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'another-user', email: 'other@example.org' } }, error: null });
    await expect(loadProfile('authenticated-user-id')).rejects.toThrow('does not match');
    await expect(saveProfile({ id: 'authenticated-user-id', first_name: 'Civic' })).rejects.toThrow('only your own profile');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('maps case-insensitive username uniqueness errors to a safe recovery message', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'authenticated-user-id' }, error: null });
    mockUpdateEq.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    await expect(saveProfile({ id: 'authenticated-user-id', username: 'Alpha_User' }))
      .rejects.toMatchObject({ code: '23505', message: expect.stringContaining('already in use') });
  });

  test('surfaces profile update errors', async () => {
    const writeError = { message: 'profile write denied' };
    mockMaybeSingle.mockResolvedValue({ data: { id: 'authenticated-user-id' }, error: null });
    mockUpdateEq.mockResolvedValue({ error: writeError });

    await expect(saveProfile({
      id: 'authenticated-user-id',
      full_name: 'Civic Citizen',
    })).rejects.toEqual(writeError);
  });
});
