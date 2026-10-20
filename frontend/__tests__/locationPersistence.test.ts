import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { createIssue } from '../hooks/useIssues';
import { mapDatabaseIssueRow } from '../lib/issueMapper';

const mockGetForegroundPermissionsAsync = jest.fn();
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockGetProviderStatusAsync = jest.fn();
const mockGetCurrentPositionAsync = jest.fn();
const mockReverseGeocode = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
const mockSingle = jest.fn();
const mockUpsert = jest.fn();
const queryBuilder = {
  select: (...args: unknown[]) => mockSelect(...args),
  eq: (...args: unknown[]) => mockEq(...args),
  maybeSingle: (...args: unknown[]) => mockMaybeSingle(...args),
  insert: (...args: unknown[]) => mockInsert(...args),
  upsert: (...args: unknown[]) => mockUpsert(...args),
  single: (...args: unknown[]) => mockSingle(...args),
};

jest.mock('expo-location', () => ({
  Accuracy: { High: 6 },
  getForegroundPermissionsAsync: (...args: unknown[]) => mockGetForegroundPermissionsAsync(...args),
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestForegroundPermissionsAsync(...args),
  getProviderStatusAsync: (...args: unknown[]) => mockGetProviderStatusAsync(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPositionAsync(...args),
}));
jest.mock('../lib/location', () => ({
  reverseGeocode: (...args: unknown[]) => mockReverseGeocode(...args),
}));
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { user: { id: 'authenticated-user-id' } } },
        error: null,
      })),
    },
    from: jest.fn(() => queryBuilder),
  },
  isSupabaseConfigured: true,
}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/geohash', () => ({
  calculateDistance: jest.fn(),
  encodeGeohash: jest.fn(() => 'tdr1'),
}));
jest.mock('../lib/issueMapper', () => ({
  mapDatabaseIssueRow: jest.requireActual('../lib/issueMapper').mapDatabaseIssueRow,
  mapLocalIssueRow: jest.fn(),
}));
jest.mock('../lib/storage', () => ({
  resolvePhotoUrls: jest.fn(async (photos: string[]) => photos),
}));
jest.mock('../lib/sqliteIssues', () => ({
  createIssueSqlite: jest.fn(),
  listIssues: jest.fn(),
  ensureSeedIssues: jest.fn(),
}));
jest.mock('../lib/sqliteAuth', () => ({ ensureSessionUserId: jest.fn() }));
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'authenticated-user-id', email: 'user@example.org' } } }),
}));

const persistedIssue = {
  id: 'issue-123',
  user_id: 'authenticated-user-id',
  title: 'Broken road surface',
  description: 'A damaged road surface is visible.',
  category: 'pothole',
  photos: ['https://storage.example/evidence.jpg'],
  location: 'POINT(77.5946 12.9716)',
  address: 'MG Road, Bengaluru',
  geohash: 'tdr1',
  location_accuracy_m: 24,
  location_source: 'gps',
  location_confirmed: true,
  privacy: 'personal',
  status: 'pending',
  moderation_status: 'active',
  created_at: '2026-10-20T10:00:00.000Z',
};

describe('report location workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelect.mockReturnValue(queryBuilder);
    mockEq.mockReturnValue(queryBuilder);
    mockInsert.mockReturnValue(queryBuilder);
    mockUpsert.mockResolvedValue({ error: null });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockSingle.mockResolvedValue({ data: persistedIssue, error: null });
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: true });
    mockGetProviderStatusAsync.mockResolvedValue({ locationServicesEnabled: true });
    mockGetCurrentPositionAsync.mockResolvedValue(null);
    mockReverseGeocode.mockResolvedValue('');
  });

  test('handles denied location permission without inventing coordinates', async () => {
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await expect(result.current.requestLocation()).resolves.toBe(false);
    });

    expect(result.current.coords).toBeNull();
    expect(result.current.address).toBe('');
    expect(result.current.error).toMatch(/permission is unavailable/i);
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
  });

  test('handles unavailable device location services gracefully', async () => {
    mockGetForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', canAskAgain: true });
    mockGetProviderStatusAsync.mockResolvedValue({ locationServicesEnabled: false });
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await expect(result.current.requestLocation()).resolves.toBe(false);
    });

    expect(result.current.coords).toBeNull();
    expect(result.current.error).toMatch(/turn on device location services/i);
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();
  });

  test('persists confirmed GPS location with owner and restores it from the issue row', async () => {
    const issue = await createIssue({
      client_request_id: 'client-request-123',
      user_id: 'authenticated-user-id',
      title: 'Broken road surface',
      description: 'A damaged road surface is visible.',
      category: 'pothole',
      photos: ['https://storage.example/evidence.jpg'],
      lat: 12.9716,
      lng: 77.5946,
      address: 'MG Road, Bengaluru',
      location_accuracy_m: 24,
      location_source: 'gps',
      location_confirmed: true,
      privacy: 'twitter',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'authenticated-user-id',
      location: 'POINT(77.5946 12.9716)',
      geohash: 'tdr1',
      address: 'MG Road, Bengaluru',
      location_accuracy_m: 24,
      location_source: 'gps',
      location_confirmed: true,
    }));
    expect(issue.userId).toBe('authenticated-user-id');
    expect(issue.location).toMatchObject({
      lat: 12.9716,
      lng: 77.5946,
      address: 'MG Road, Bengaluru',
    });
    expect(issue.locationAccuracyM).toBe(24);
    expect(issue.locationSource).toBe('gps');
    expect(issue.locationConfirmed).toBe(true);

    const reopenedIssue = await mapDatabaseIssueRow(persistedIssue);
    expect(reopenedIssue.location).toMatchObject({
      lat: 12.9716,
      lng: 77.5946,
      address: 'MG Road, Bengaluru',
    });
    expect(reopenedIssue.locationAccuracyM).toBe(24);
    expect(reopenedIssue.locationSource).toBe('gps');
    expect(reopenedIssue.locationConfirmed).toBe(true);
  });

  test('normalizes the confirmed address before persisting it', async () => {
    await createIssue({
      client_request_id: 'client-request-normalized-address',
      user_id: 'authenticated-user-id',
      title: 'Broken road surface',
      description: 'A damaged road surface is visible.',
      category: 'pothole',
      photos: ['https://storage.example/evidence.jpg'],
      address: '  MG Road,\n Bengaluru  ',
      location_source: 'manual',
      location_confirmed: true,
      privacy: 'twitter',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      address: 'MG Road, Bengaluru',
      location: null,
      geohash: '',
      location_source: 'manual',
    }));
  });

  test('saves the reviewed directory suggestions and every generated draft with the created report', async () => {
    await createIssue({
      client_request_id: 'client-request-with-assistance',
      user_id: 'authenticated-user-id',
      title: 'Broken road surface',
      description: 'A damaged road surface is visible.',
      category: 'pothole',
      photos: ['https://storage.example/evidence.jpg'],
      address: 'MG Road, Bengaluru',
      location_source: 'manual',
      location_confirmed: true,
      privacy: 'twitter',
      authorities: ['@VerifiedCivic'],
      authority_suggestions: [{
        id: 'authority-1',
        name: 'Verified Municipal Department',
        handle: '@VerifiedCivic',
        confidence: 0.9,
        matchReason: 'Verified directory match for pothole in Bengaluru',
        profileUrl: 'https://x.com/VerifiedCivic',
        sourceUrl: 'https://example.gov',
        verificationStatus: 'verified',
      }],
      generated_contents: [{
        generationId: '11111111-1111-4111-8111-111111111111',
        content: {
          title: 'Reported road surface damage',
          description: 'A damaged section of road is visible in the report.',
          summary: 'A road surface issue was reported.',
          awareness_caption: 'Please review this reported road surface issue.',
          hashtags: ['#CivicVigilance'],
          category_suggestion: null,
          clarification_question: null,
        },
      }],
    });

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledWith(
      [expect.objectContaining({
        issue_id: 'issue-123',
        user_id: 'authenticated-user-id',
        public_handle: '@VerifiedCivic',
        selected: true,
      })],
      { onConflict: 'issue_id,public_handle', ignoreDuplicates: true },
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      [expect.objectContaining({
        issue_id: 'issue-123',
        user_id: 'authenticated-user-id',
        generation_id: '11111111-1111-4111-8111-111111111111',
        content_type: 'report_draft',
      })],
      { onConflict: 'issue_id,generation_id', ignoreDuplicates: true },
    );
  });
});
