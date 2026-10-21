import { uploadPhoto } from '../lib/storage';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getSession: jest.fn() },
    storage: { from: jest.fn() },
  },
}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/imageOptimizer', () => ({
  needsOptimization: jest.fn().mockResolvedValue(false),
  optimizeImage: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    name: 'evidence.jpg',
    type: 'image/jpeg',
    size: 3,
    bytes: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  })),
  deleteAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-id' }));

const mockSupabase = supabase as unknown as {
  auth: { getSession: jest.Mock };
  storage: { from: jest.Mock };
};
const mockUpload = jest.fn();
const mockGetSession = mockSupabase.auth.getSession;
const mockFrom = mockSupabase.storage.from;

describe('photo storage upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-123' } } } });
    mockUpload.mockResolvedValue({
      data: { path: 'user-123/issues/request-ai.jpg' },
      error: null,
    });
    mockFrom.mockReturnValue({
      upload: mockUpload,
      getPublicUrl: jest.fn(() => ({
        data: { publicUrl: 'https://storage.example.test/public-photo.jpg' },
      })),
    });
  });

  it('uploads native file bytes to the private bucket and returns a private reference', async () => {
    const reference = await uploadPhoto(
      'file:///cache/evidence.jpg',
      'issues',
      false,
      'request-ai',
      true,
    );

    expect(reference).toBe('supabase-storage://private-issue-photos/user-123/issues/request-ai.jpg');
    expect(mockFrom).toHaveBeenCalledWith('private-issue-photos');
    expect(mockUpload).toHaveBeenCalledWith(
      'user-123/issues/request-ai.jpg',
      expect.any(ArrayBuffer),
      expect.objectContaining({
        contentType: 'image/jpeg',
        upsert: true,
      }),
    );
    expect([...new Uint8Array(mockUpload.mock.calls[0][1])]).toEqual([1, 2, 3]);
  });

  it('turns a storage transport failure into an actionable message without exposing internals', async () => {
    jest.useFakeTimers();
    mockUpload.mockRejectedValue(new Error('Network request failed'));
    const upload = uploadPhoto('file:///cache/evidence.jpg', 'issues', false, 'request-ai', true);
    const failure = expect(upload).rejects.toThrow(
      'Could not connect to photo storage. Check your internet connection and try again.',
    );

    await jest.runAllTimersAsync();
    await failure;
    expect(mockUpload).toHaveBeenCalledTimes(3);
    jest.useRealTimers();
  });

  it('reports storage authorization failures without retrying or showing provider details', async () => {
    mockUpload.mockResolvedValue({
      data: null,
      error: {
        message: 'row-level security policy details',
        status: 403,
        statusCode: '403',
      },
    });

    await expect(
      uploadPhoto('file:///cache/evidence.jpg', 'issues', false, 'request-ai', true),
    ).rejects.toThrow('Photo storage denied this upload. Sign in again and retry.');
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });
});
