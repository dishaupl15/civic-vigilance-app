import { supabase } from './supabase';

export type EventSource = 'local' | 'citizen' | 'official' | 'authoritative_api';

export async function addCitizenTimelineEvent(issueId: string, userId: string, eventType: string, details: Record<string, unknown> = {}) {
  if (!issueId || !userId || !eventType.trim()) throw new Error('Issue, user and event type are required.');
  const { data, error } = await supabase.from('issue_events').insert({
    issue_id: issueId, created_by: userId, event_type: eventType.trim(), source: 'citizen', details,
  }).select('*').single();
  if (error) throw new Error('Could not save the timeline update.');
  return data;
}

export async function scheduleFollowUp(issueId: string, userId: string, dueAt: Date) {
  if (dueAt.getTime() <= Date.now()) throw new Error('Follow-up time must be in the future.');
  const { data, error } = await supabase.from('follow_up_reminders').insert({
    issue_id: issueId, user_id: userId, due_at: dueAt.toISOString(), status: 'scheduled',
  }).select('*').single();
  if (error) throw new Error('Could not schedule the follow-up reminder.');
  return data;
}

export async function cancelFollowUp(reminderId: string, userId: string) {
  const { error } = await supabase.from('follow_up_reminders').update({ status: 'cancelled' }).eq('id', reminderId).eq('user_id', userId);
  if (error) throw new Error('Could not cancel the follow-up reminder.');
}
