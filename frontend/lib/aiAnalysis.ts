import { isSupabaseConfigured, supabase } from './supabase';
import { resolveNodeApiBaseUrl } from './nodeApiUrl';

export type ImageAnalysis = {
  issue_category: string;
  description: string;
  visible_evidence: string[];
  confidence: number;
  needs_review: boolean;
  uncertainties: string[];
};

export async function requestImageAnalysis(imageUrl: string, privacyNoticeAccepted: boolean): Promise<ImageAnalysis> {
  const apiBase = resolveNodeApiBaseUrl(process.env.EXPO_PUBLIC_NODE_API_URL, __DEV__);
  if (!apiBase) throw new Error('Image analysis is not configured. Continue manually.');
  if (!isSupabaseConfigured) throw new Error('Sign in with the production service before requesting analysis.');
  if (!privacyNoticeAccepted) throw new Error('Review and accept the image-analysis privacy notice first.');
  if (!/^https:\/\//i.test(imageUrl)) throw new Error('Upload the evidence photo before requesting analysis.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) throw new Error('Sign in again before requesting image analysis.');
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/analyze-image`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ image_url: imageUrl, privacy_notice_accepted: true }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Image analysis failed. Continue manually.');
    return body.analysis as ImageAnalysis;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('Image analysis timed out. Continue manually or retry.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
