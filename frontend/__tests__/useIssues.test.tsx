import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useIssues } from '../hooks/useIssues';

let mockSession: { user: { id: string; email: string | null } } | null = null;
const mockLimit = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();
const mockMapDatabaseIssueRow = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  isSupabaseConfigured: true,
}));
jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ session: mockSession }),
}));
jest.mock('../lib/geohash', () => ({
  calculateDistance: jest.fn(() => 0),
  encodeGeohash: jest.fn(),
}));
jest.mock('../lib/issueMapper', () => ({
  mapDatabaseIssueRow: (...args: unknown[]) => mockMapDatabaseIssueRow(...args),
  mapLocalIssueRow: jest.fn(),
}));
jest.mock('../lib/sqliteIssues', () => ({
  createIssueSqlite: jest.fn(),
  listIssues: jest.fn(),
  ensureSeedIssues: jest.fn(),
}));
jest.mock('../lib/sqliteAuth', () => ({ ensureSessionUserId: jest.fn() }));

describe('useIssues report loading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = { user: { id: 'user-123', email: 'user@example.org' } };
    mockSelect.mockReturnThis();
    mockOrder.mockReturnThis();
    mockFrom.mockReturnValue({
      select: mockSelect,
      order: mockOrder,
      limit: mockLimit,
    });
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockMapDatabaseIssueRow.mockImplementation(async (row) => row);
  });

  test('loads public reports without requiring an authenticated session', async () => {
    mockSession = null;
    const { result } = renderHook(() => useIssues('newest'));

    await waitFor(() => expect(mockLimit).toHaveBeenCalledWith(100));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('issues');
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([]);
  });

  test('maps authenticated report rows and includes the metrics relation', async () => {
    const report = { id: 'issue-1', title: 'Broken road surface' };
    mockLimit.mockResolvedValue({ data: [report], error: null });
    const { result } = renderHook(() => useIssues('newest'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockSelect).toHaveBeenCalledWith(
      '*,issue_metrics(upvotes,downvotes,comments,shares,twitter_impressions)',
    );
    expect(mockMapDatabaseIssueRow).toHaveBeenCalledWith(report, 0, [report]);
    expect(result.current.data).toEqual([report]);
    expect(result.current.error).toBeNull();
  });

  test('treats an empty report response as an empty state', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useIssues('newest'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  test('does not expose raw Supabase schema errors or treat failures as empty results', async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.issues' in the schema cache" },
    });
    const { result } = renderHook(() => useIssues('newest'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBe('Could not load reports. The data service is unavailable. Please try again.');
  });

  test('retry performs a new request after a failed report load', async () => {
    mockLimit
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST205', message: 'Missing relation' },
      })
      .mockResolvedValueOnce({ data: [{ id: 'issue-2' }], error: null });
    const { result } = renderHook(() => useIssues('newest'));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    await act(async () => result.current.retry());

    await waitFor(() => expect(result.current.data).toEqual([{ id: 'issue-2' }]));
    expect(mockLimit).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });
});
