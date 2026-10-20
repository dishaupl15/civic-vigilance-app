import { loadIssueEnhancements, saveIssueEnhancements } from '../lib/issueEnhancements';

const mockGetSession = jest.fn();
const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockEq = jest.fn();
const mockOrder = jest.fn();
const mockSelect = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
  isSupabaseConfigured: true,
}));

const draft = {
  title: 'Reported road surface damage',
  description: 'A damaged section of road is visible in the report.',
  summary: 'A road surface issue was reported.',
  awareness_caption: 'Please review this reported road surface issue.',
  hashtags: ['#CivicVigilance'],
  category_suggestion: null,
  clarification_question: null,
};

const account = {
  id: 'authority-1',
  name: 'Verified Municipal Department',
  handle: '@VerifiedCivic',
  confidence: 0.9,
  matchReason: 'Verified directory match for pothole in this location',
  profileUrl: 'https://x.com/VerifiedCivic',
  sourceUrl: 'https://example.gov',
  lastVerifiedAt: '2026-10-01T00:00:00.000Z',
  verificationStatus: 'verified' as const,
};

describe('report enhancement persistence', () => {
  let queryData: Record<string, { data: unknown[] | null; error: unknown }>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: 'owner-1' } } },
      error: null,
    });
    mockUpsert.mockResolvedValue({ error: null });
    queryData = {
      issue_authority_suggestions: { data: [], error: null },
      issue_generated_content: { data: [], error: null },
    };
    mockFrom.mockImplementation((table: string) => {
      const builder = {
        upsert: (...args: unknown[]) => mockUpsert(table, ...args),
        select: (...args: unknown[]) => mockSelect(table, ...args),
        eq: (...args: unknown[]) => mockEq(table, ...args),
        order: (...args: unknown[]) => {
          mockOrder(table, ...args);
          return Promise.resolve(queryData[table]);
        },
      };
      mockSelect.mockImplementation(() => builder);
      mockEq.mockImplementation(() => builder);
      mockOrder.mockImplementation(() => Promise.resolve(queryData[table]));
      return builder;
    });
  });

  it('stores verified suggestions and each generation idempotently for the owner', async () => {
    await saveIssueEnhancements({
      issueId: 'issue-1',
      userId: 'owner-1',
      category: 'pothole',
      authoritySuggestions: [account, { ...account, handle: '@verifiedcivic', name: 'Duplicate casing' }],
      selectedAuthorityHandles: ['@VerifiedCivic'],
      generatedContents: [{
        generationId: '11111111-1111-4111-8111-111111111111',
        content: draft,
      }],
    });

    expect(mockFrom).toHaveBeenCalledWith('issue_authority_suggestions');
    expect(mockFrom).toHaveBeenCalledWith('issue_generated_content');
    expect(mockUpsert).toHaveBeenCalledWith('issue_authority_suggestions', [
      expect.objectContaining({
        issue_id: 'issue-1',
        user_id: 'owner-1',
        authority_id: 'authority-1',
        public_handle: '@verifiedcivic',
        selected: true,
      }),
    ], { onConflict: 'issue_id,public_handle', ignoreDuplicates: true });
    expect(mockUpsert).toHaveBeenCalledWith('issue_generated_content', [
      expect.objectContaining({
        issue_id: 'issue-1',
        user_id: 'owner-1',
        generation_id: '11111111-1111-4111-8111-111111111111',
        content_type: 'report_draft',
        generated_content: draft,
      }),
    ], { onConflict: 'issue_id,generation_id', ignoreDuplicates: true });
  });

  it('rejects a different authenticated owner before accessing Supabase tables', async () => {
    await expect(saveIssueEnhancements({
      issueId: 'issue-1',
      userId: 'another-user',
      category: 'pothole',
      authoritySuggestions: [],
      selectedAuthorityHandles: [],
      generatedContents: [],
    })).rejects.toThrow('Sign in as the report owner');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('rejects unverified accounts, malformed links, invalid selections, and duplicate generation IDs', async () => {
    const params = {
      issueId: 'issue-1',
      userId: 'owner-1',
      category: 'pothole' as const,
      selectedAuthorityHandles: [] as string[],
      generatedContents: [],
    };
    await expect(saveIssueEnhancements({
      ...params,
      authoritySuggestions: [{ ...account, verificationStatus: 'seed' }],
    })).rejects.toThrow('invalid and cannot be saved');
    await expect(saveIssueEnhancements({
      ...params,
      authoritySuggestions: [{ ...account, profileUrl: 'javascript:alert(1)' }],
    })).rejects.toThrow('invalid and cannot be saved');
    await expect(saveIssueEnhancements({
      ...params,
      authoritySuggestions: [{ ...account, profileUrl: 'https://untrusted.example/VerifiedCivic' }],
    })).rejects.toThrow('invalid and cannot be saved');
    await expect(saveIssueEnhancements({
      ...params,
      authoritySuggestions: [account],
      selectedAuthorityHandles: ['@Unrelated'],
    })).rejects.toThrow('not part of the verified suggestions');
    await expect(saveIssueEnhancements({
      ...params,
      authoritySuggestions: [],
      generatedContents: [
        { generationId: '11111111-1111-4111-8111-111111111111', content: draft },
        { generationId: '11111111-1111-4111-8111-111111111111', content: draft },
      ],
    })).rejects.toThrow('invalid or duplicate generation ID');
  });

  it('loads saved items after reopening using both report and owner filters', async () => {
    queryData.issue_authority_suggestions = {
      data: [{
        authority_id: 'authority-1',
        display_name: account.name,
        public_handle: account.handle,
        profile_url: account.profileUrl,
        category: 'pothole',
        relevance_reason: account.matchReason,
        source_url: account.sourceUrl,
        last_verified_at: account.lastVerifiedAt,
        verification_status: 'verified',
        selected: true,
      }],
      error: null,
    };
    queryData.issue_generated_content = { data: [{ generated_content: draft }], error: null };

    const saved = await loadIssueEnhancements('issue-1', 'owner-1');

    expect(saved.authoritySuggestions).toHaveLength(1);
    expect(saved.authoritySuggestions[0]).toMatchObject({ handle: '@VerifiedCivic', selected: true });
    expect(saved.generatedContents).toEqual([draft]);
    expect(mockEq).toHaveBeenCalledWith('issue_authority_suggestions', 'issue_id', 'issue-1');
    expect(mockEq).toHaveBeenCalledWith('issue_authority_suggestions', 'user_id', 'owner-1');
    expect(mockEq).toHaveBeenCalledWith('issue_generated_content', 'issue_id', 'issue-1');
    expect(mockEq).toHaveBeenCalledWith('issue_generated_content', 'user_id', 'owner-1');
  });

  it('surfaces database failures during saves and reloads', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'RLS denied' } });
    await expect(saveIssueEnhancements({
      issueId: 'issue-1',
      userId: 'owner-1',
      category: 'pothole',
      authoritySuggestions: [account],
      selectedAuthorityHandles: [],
      generatedContents: [],
    })).rejects.toThrow('RLS denied');

    queryData.issue_authority_suggestions = { data: null, error: { code: '42501', message: 'permission denied' } };
    await expect(loadIssueEnhancements('issue-1', 'owner-1')).rejects.toThrow('42501');
  });
});
