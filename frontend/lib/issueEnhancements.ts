import { CategoryKey } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';
import { GeneratedReportContent, parseReportContentResponse } from './reportContentSchema';
import { MatchedAuthority } from './smartAuthorities';

export interface GeneratedReportSnapshot {
  generationId: string;
  content: GeneratedReportContent;
}

export interface SavedIssueEnhancements {
  authoritySuggestions: Array<MatchedAuthority & { selected: boolean; category: CategoryKey }>;
  generatedContents: GeneratedReportContent[];
}

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Row
    : undefined;
}

function requiredString(row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Saved report assistance is missing ${field}.`);
  }
  return value;
}

function isSafeHttpsUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function isSafeProfileUrl(value: string | undefined, handle: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return isSafeHttpsUrl(value)
      && ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLocaleLowerCase())
      && url.pathname.split('/').filter(Boolean).length === 1
      && url.pathname.split('/').filter(Boolean)[0].toLocaleLowerCase() === handle.slice(1).toLocaleLowerCase();
  } catch {
    return false;
  }
}

async function requireOwnerSession(userId: string): Promise<void> {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Could not verify your session before saving report assistance.');
  if (!data.session?.user?.id || data.session.user.id !== userId) {
    throw new Error('Sign in as the report owner to access saved report assistance.');
  }
}

export async function saveIssueEnhancements(params: {
  issueId: string;
  userId: string;
  category: CategoryKey;
  authoritySuggestions: MatchedAuthority[];
  selectedAuthorityHandles: string[];
  generatedContents: GeneratedReportSnapshot[];
}): Promise<void> {
  await requireOwnerSession(params.userId);
  const selected = new Set(params.selectedAuthorityHandles.map((handle) => handle.toLocaleLowerCase()));
  const uniqueSuggestions = new Map<string, MatchedAuthority>();
  for (const suggestion of params.authoritySuggestions) {
    if (suggestion.verificationStatus !== 'verified'
        || !suggestion.id
        || !/^@[A-Za-z0-9_]{1,15}$/.test(suggestion.handle)
        || !suggestion.name.trim()
        || !isSafeProfileUrl(suggestion.profileUrl, suggestion.handle)
        || !isSafeHttpsUrl(suggestion.sourceUrl)) {
      throw new Error('A report account suggestion is invalid and cannot be saved.');
    }
    uniqueSuggestions.set(suggestion.handle.toLocaleLowerCase(), suggestion);
  }
  if ([...selected].some((handle) => !uniqueSuggestions.has(handle.toLocaleLowerCase()))) {
    throw new Error('A selected account is not part of the verified suggestions.');
  }

  const operations: PromiseLike<{ error: { message?: string } | null }>[] = [];
  const suggestions = [...uniqueSuggestions.values()];
  if (suggestions.length > 0) {
    operations.push(supabase.from('issue_authority_suggestions').upsert(
      suggestions.map((suggestion) => ({
        issue_id: params.issueId,
        user_id: params.userId,
        authority_id: suggestion.id,
        display_name: suggestion.name,
        public_handle: suggestion.handle,
        profile_url: suggestion.profileUrl ?? null,
        category: params.category,
        relevance_reason: suggestion.matchReason,
        source_url: suggestion.sourceUrl ?? null,
        last_verified_at: suggestion.lastVerifiedAt ?? null,
        verification_status: 'verified',
        selected: selected.has(suggestion.handle.toLocaleLowerCase()),
      })),
      { onConflict: 'issue_id,public_handle', ignoreDuplicates: true },
    ));
  }

  const generations = new Set<string>();
  for (const generated of params.generatedContents) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generated.generationId)
        || generations.has(generated.generationId)) {
      throw new Error('A generated report draft has an invalid or duplicate generation ID.');
    }
    generations.add(generated.generationId);
    parseReportContentResponse({ content: generated.content });
  }
  if (params.generatedContents.length > 0) {
    operations.push(supabase.from('issue_generated_content').upsert(
      params.generatedContents.map((generated) => ({
        issue_id: params.issueId,
        user_id: params.userId,
        generation_id: generated.generationId,
        category: params.category,
        content_type: 'report_draft',
        generated_content: generated.content,
      })),
      { onConflict: 'issue_id,generation_id', ignoreDuplicates: true },
    ));
  }

  const results = await Promise.all(operations);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(`The report was saved, but its suggestions or generated drafts were not saved (${failed.error.message || 'database request failed'}). Retry submission to finish saving them.`);
  }
}

export async function loadIssueEnhancements(issueId: string, userId: string): Promise<SavedIssueEnhancements> {
  await requireOwnerSession(userId);
  const [suggestionsResult, contentResult] = await Promise.all([
    supabase.from('issue_authority_suggestions')
      .select('authority_id,display_name,public_handle,profile_url,category,relevance_reason,source_url,last_verified_at,verification_status,selected')
      .eq('issue_id', issueId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase.from('issue_generated_content')
      .select('generated_content')
      .eq('issue_id', issueId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);
  if (suggestionsResult.error || contentResult.error) {
    const failure = suggestionsResult.error || contentResult.error;
    throw new Error(`Could not load saved report assistance (${failure?.code || 'unknown'}: ${failure?.message || 'database request failed'}).`);
  }

  const authoritySuggestions = (suggestionsResult.data ?? []).map((value: unknown) => {
    const row = asRow(value);
    if (!row) throw new Error('A saved account suggestion has an invalid shape.');
    const category = requiredString(row, 'category');
    if (!/^@[A-Za-z0-9_]{1,15}$/.test(requiredString(row, 'public_handle'))
        || row.verification_status !== 'verified'
        || typeof row.selected !== 'boolean'
        || !isSafeProfileUrl(typeof row.profile_url === 'string' ? row.profile_url : undefined, requiredString(row, 'public_handle'))
        || !isSafeHttpsUrl(typeof row.source_url === 'string' ? row.source_url : undefined)) {
      throw new Error('A saved account suggestion failed validation.');
    }
    return {
      id: requiredString(row, 'authority_id'),
      name: requiredString(row, 'display_name'),
      handle: requiredString(row, 'public_handle'),
      confidence: 1,
      matchReason: requiredString(row, 'relevance_reason'),
      profileUrl: typeof row.profile_url === 'string' ? row.profile_url : undefined,
      sourceUrl: typeof row.source_url === 'string' ? row.source_url : undefined,
      lastVerifiedAt: typeof row.last_verified_at === 'string' ? row.last_verified_at : undefined,
      verificationStatus: 'verified' as const,
      selected: row.selected,
      category: category as CategoryKey,
    };
  });
  const generatedContents = (contentResult.data ?? []).map((value: unknown) => {
    const row = asRow(value);
    if (!row) throw new Error('A saved generated draft has an invalid shape.');
    return parseReportContentResponse({ content: row.generated_content });
  });

  return { authoritySuggestions, generatedContents };
}
