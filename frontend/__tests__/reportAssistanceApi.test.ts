import { requestReportContent } from '../lib/reportAssistance';
import { supabase } from '../lib/supabase';

jest.mock('../lib/backend', () => ({ getBackend: () => 'supabase' }));
jest.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: jest.fn() } },
}));

const mockGetSession = (supabase as unknown as {
  auth: { getSession: jest.Mock };
}).auth.getSession;
const originalFetch = global.fetch;
const originalApiUrl = process.env.EXPO_PUBLIC_NODE_API_URL;
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

const generatedResponse = {
  success: true,
  analysis: {
    issue_category: 'pothole',
    description: 'A damaged road surface is visible.',
    visible_evidence: ['A damaged road surface'],
    confidence: 0.9,
    needs_review: false,
    uncertainties: [],
  },
  content: {
    title: 'Reported road surface damage',
    description: 'A damaged section of road is visible in the report.',
    summary: 'A road surface issue was reported.',
    awareness_caption: 'Please review this reported road surface issue.',
    hashtags: ['#CivicVigilance'],
    category_suggestion: null,
    clarification_question: null,
  },
};

describe('report AI API request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_NODE_API_URL = 'https://civic-vigilance-backend-theta.vercel.app/api';
    global.fetch = mockFetch;
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-session-token' } },
      error: null,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_NODE_API_URL;
    else process.env.EXPO_PUBLIC_NODE_API_URL = originalApiUrl;
  });

  it('sends the uploaded private photo reference to the authenticated generation route and parses the result', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => generatedResponse,
    } as Response);

    const result = await requestReportContent(
      { title: '', category: 'pothole', description: 'A pothole is visible in the road.' },
      'supabase-storage://private-issue-photos/user-123/issues/request-ai.jpg',
      true,
      'request-ai',
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://civic-vigilance-backend-theta.vercel.app/api/generate-report-content',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer test-session-token' }),
        signal: expect.any(AbortSignal),
      }),
    );
    const request = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(request).toEqual(expect.objectContaining({
      image_reference: 'supabase-storage://private-issue-photos/user-123/issues/request-ai.jpg',
      request_id: 'request-ai',
      privacy_notice_accepted: true,
      report: {
        title: '',
        category: 'pothole',
        description: 'A pothole is visible in the road.',
      },
    }));
    expect(result.content).toEqual(generatedResponse.content);
    expect(result.analysis).toEqual(generatedResponse.analysis);
  });

  it('turns network failures into a useful sanitized AI-service error', async () => {
    mockFetch.mockRejectedValue(new Error('Network request failed'));

    await expect(requestReportContent(
      { title: '', category: 'pothole', description: 'A pothole is visible in the road.' },
      'supabase-storage://private-issue-photos/user-123/issues/request-ai.jpg',
      true,
    )).rejects.toThrow(
      'Could not reach Civic Vigilance AI services. Check your internet connection and retry.',
    );
  });
});
