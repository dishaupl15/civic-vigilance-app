import { supabase, isSupabaseConfigured } from './supabase';
import { getBackend } from './backend';
import { castVoteSqlite, getUserVoteSqlite } from './sqliteIssues';
import { ensureSessionUserId } from './sqliteAuth';

export type VoteValue = -1 | 0 | 1;
export type UserVoteResult =
  | { status: 'ready'; vote: VoteValue; hasVote: boolean }
  | { status: 'unauthenticated' }
  | { status: 'unconfigured' };

export interface CastVoteResult {
  vote: VoteValue;
  upvotes?: number;
  downvotes?: number;
  warning?: string;
}

const activeVoteKeys = new Set<string>();

function parseVote(value: unknown): VoteValue {
  return value === -1 || value === 1 ? value : 0;
}

export async function getUserVote(issueId: string): Promise<UserVoteResult> {
  if (getBackend() === 'sqlite') {
    const userId = await ensureSessionUserId();
    const vote = parseVote(getUserVoteSqlite(Number(issueId), userId));
    return { status: 'ready', vote, hasVote: vote !== 0 };
  }
  if (!isSupabaseConfigured) return { status: 'unconfigured' };

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error('Could not verify your sign-in. Please sign in again.');
  const userId = authData.user?.id;
  if (!userId) return { status: 'unauthenticated' };

  const { data, error } = await supabase
    .from('votes')
    .select('vote')
    .eq('issue_id', issueId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Could not load your vote. Please try again.');

  const vote = parseVote(data?.vote);
  return { status: 'ready', vote, hasVote: data !== null };
}

export async function castVote(issueId: string, value: -1 | 1): Promise<CastVoteResult> {
  if (getBackend() === 'sqlite') {
    const userId = await ensureSessionUserId();
    return castVoteSqlite(Number(issueId), userId, value);
  }
  if (!isSupabaseConfigured) throw new Error('Voting is unavailable because Supabase is not configured.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error('Could not verify your sign-in. Please sign in again.');
  const userId = authData.user?.id;
  if (!userId) throw new Error('Sign in before voting.');

  const lockKey = `${userId}:${issueId}`;
  if (activeVoteKeys.has(lockKey)) throw new Error('Your vote is still being saved.');
  activeVoteKeys.add(lockKey);

  try {
    const { data: currentVote, error: currentError } = await supabase
      .from('votes')
      .select('id,vote')
      .eq('issue_id', issueId)
      .eq('user_id', userId)
      .maybeSingle();
    if (currentError) throw new Error('Could not load your current vote. Please try again.');

    const next: VoteValue = currentVote?.vote === value ? 0 : value;
    if (next === 0 && currentVote) {
      const { error } = await supabase
        .from('votes')
        .delete()
        .eq('id', currentVote.id)
        .eq('user_id', userId);
      if (error) throw new Error('Your vote could not be removed. Please try again.');
    } else {
      const { error } = await supabase
        .from('votes')
        .upsert(
          { issue_id: issueId, user_id: userId, vote: next },
          { onConflict: 'issue_id,user_id' },
        );
      if (error) throw new Error('Your vote could not be saved. Please try again.');
    }

    const { data: metrics, error: metricsError } = await supabase
      .from('issue_metrics')
      .select('upvotes,downvotes')
      .eq('issue_id', issueId)
      .maybeSingle();
    if (metricsError) {
      return { vote: next, warning: 'Your vote was saved, but the updated totals could not be loaded.' };
    }

    return {
      vote: next,
      upvotes: metrics?.upvotes ?? undefined,
      downvotes: metrics?.downvotes ?? undefined,
    };
  } finally {
    activeVoteKeys.delete(lockKey);
  }
}
