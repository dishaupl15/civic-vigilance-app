import { resolveNodeApiBaseUrl } from './nodeApiUrl';
import { CategoryKey } from '../types';
import {
  GeneratedReportContent,
  parseReportImageAnalysis,
  parseReportContentResponse,
  validateReportContentInput,
} from './reportContentSchema';

export { GeneratedReportContent, parseReportContentResponse, validateReportContentInput } from './reportContentSchema';

export interface ReportAiGeneration {
  analysis: ReturnType<typeof parseReportImageAnalysis>;
  content: GeneratedReportContent;
}

export interface ReportAiCapabilities {
  available: boolean;
  missing: string[];
  invalid: string[];
}

async function authenticatedApiRequest(path: string, init?: RequestInit) {
  const apiBase = resolveNodeApiBaseUrl(process.env.EXPO_PUBLIC_NODE_API_URL, __DEV__);
  if (!apiBase) throw new Error('AI writing assistance is unavailable in this configuration.');
  const { getBackend } = await import('./backend');
  if (getBackend() !== 'supabase') {
    throw new Error('Photo-based AI writing requires the online Civic Vigilance backend.');
  }
  const { supabase, isSupabaseConfigured } = await import('./supabase');
  if (!isSupabaseConfigured) throw new Error('AI writing assistance requires an online account.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Sign in again before requesting AI writing assistance.');
  }

  const response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${data.session.access_token}`,
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body.error === 'string'
      ? body.error
      : 'AI writing assistance is unavailable. Continue manually or retry.');
  }
  return body;
}

export async function getReportContentCapabilities(): Promise<ReportAiCapabilities> {
  const body = await authenticatedApiRequest('/report-ai/capabilities');
  if (typeof body.available !== 'boolean'
      || !Array.isArray(body.missing)
      || body.missing.some((item: unknown) => typeof item !== 'string')
      || !Array.isArray(body.invalid)
      || body.invalid.some((item: unknown) => typeof item !== 'string')) {
    throw new Error('The AI service returned an invalid availability response.');
  }
  return {
    available: body.available,
    missing: body.missing,
    invalid: body.invalid,
  };
}

export async function requestReportContent(
  report: { title: string; category: CategoryKey; description: string },
  imageReference: string,
  privacyNoticeAccepted: boolean,
  requestId?: string
): Promise<ReportAiGeneration> {
  const validatedReport = validateReportContentInput(report, privacyNoticeAccepted, true);
  if (!imageReference.startsWith('supabase-storage://private-issue-photos/')) {
    throw new Error('Select a valid evidence photo before generating report content.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const body = await authenticatedApiRequest('/generate-report-content', {
      method: 'POST',
      body: JSON.stringify({
        report: {
          ...validatedReport,
        },
        image_reference: imageReference,
        ...(requestId ? { request_id: requestId } : {}),
        privacy_notice_accepted: true,
      }),
      signal: controller.signal,
    });
    if (body.success !== true) {
      throw new Error('The AI service returned an incomplete result. Continue manually or retry.');
    }
    return {
      analysis: parseReportImageAnalysis(body.analysis),
      content: parseReportContentResponse(body),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI writing timed out. Continue manually or retry.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
