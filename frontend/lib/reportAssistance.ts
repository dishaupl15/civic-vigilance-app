import { resolveNodeApiBaseUrl } from './nodeApiUrl';
import { CategoryKey } from '../types';
import {
  GeneratedReportContent,
  parseReportContentResponse,
  validateReportContentInput,
} from './reportContentSchema';

export { GeneratedReportContent, parseReportContentResponse, validateReportContentInput } from './reportContentSchema';

export async function requestReportContent(
  report: { title: string; category: CategoryKey; description: string },
  privacyNoticeAccepted: boolean
): Promise<GeneratedReportContent> {
  const validatedReport = validateReportContentInput(report, privacyNoticeAccepted);
  const apiBase = resolveNodeApiBaseUrl(process.env.EXPO_PUBLIC_NODE_API_URL, __DEV__);
  if (!apiBase) throw new Error('AI writing assistance is unavailable in this development configuration.');
  const { supabase, isSupabaseConfigured } = await import('./supabase');
  if (!isSupabaseConfigured) throw new Error('AI writing assistance requires a signed-in service session.');

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sign in again before requesting AI writing assistance.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/generate-report-content`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        report: {
          ...validatedReport,
        },
        privacy_notice_accepted: true,
      }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body.error === 'string'
        ? body.error
        : 'AI writing assistance is unavailable. Continue manually or retry.');
    }
    return parseReportContentResponse(body);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI writing timed out. Continue manually or retry.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
