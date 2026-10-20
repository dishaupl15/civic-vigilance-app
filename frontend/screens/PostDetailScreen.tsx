import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Image, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Comment, IssueWithUserData } from '../types';
import { getIssueByIdSqlite, listCommentsSqlite, addCommentSqlite } from '../lib/sqliteIssues';
import ActionBar from '../components/ActionBar';
import { castVote, getUserVote } from '../lib/votes';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import { getBackend } from '../lib/backend';
import { formatCount, getTimeAgo } from '../lib/format';
import { CATEGORY_EMOJIS } from '../components/CategoryPicker';
import { showShareDialog, composePostText } from '../lib/sharingEnhanced';
import { mapDatabaseCommentRow, mapDatabaseIssueRow, mapLocalCommentRow, mapLocalIssueRow } from '../lib/issueMapper';
import { loadIssueEnhancements, SavedIssueEnhancements } from '../lib/issueEnhancements';

export default function PostDetailScreen({ route }: any) {
  const { id } = route.params as { id: string };
  const [issue, setIssue] = useState<IssueWithUserData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [voteLoading, setVoteLoading] = useState(true);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [up, setUp] = useState(0);
  const [down, setDown] = useState(0);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedEnhancements, setSavedEnhancements] = useState<SavedIssueEnhancements | null>(null);
  const [enhancementsLoading, setEnhancementsLoading] = useState(false);
  const [enhancementsError, setEnhancementsError] = useState<string | null>(null);
  const [enhancementRetry, setEnhancementRetry] = useState(0);
  const { session, isGuest, signOut } = useAuth();
  const localUserId = Number(session?.user?.id || 1);
  const signOutForLogin = async () => {
    const result = await signOut();
    if (result?.error) Alert.alert('Logout failed', result.error);
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setLoadError(null);
        setSavedEnhancements(null);
        setEnhancementsLoading(false);
        setEnhancementsError(null);
        if (id.startsWith('dummy-')) {
        // Mock data for dummy issues
        const dummyIssue: IssueWithUserData = {
          id,
          userId: 'user-1',
          title: id === 'dummy-1' ? 'Pothole on Main St causing traffic' : (id === 'dummy-2' ? 'Overflowing Garbage Bin' : 'Broken Streetlight'),
          description: id === 'dummy-1'
            ? 'Large pothole in the middle lane causing severe slowdowns during rush hour. Several cars have been damaged.'
            : 'The garbage bin at the market entrance has been overflowing for 3 days. Foul smell and attracting stray animals.',
          category: id === 'dummy-1' ? 'pothole' : (id === 'dummy-2' ? 'garbage' : 'streetlight'),
          photos: [],
          imageUrl: id === 'dummy-1'
            ? 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=800'
            : (id === 'dummy-2' ? 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&q=80&w=800' : 'https://images.unsplash.com/photo-1555677284-6a6f9716399a?auto=format&fit=crop&q=80&w=800'),
          address: 'Mumbai, India',
          privacy: 'twitter',
          metrics: { upvotes: 42, downvotes: 2, comments: 4, shares: 8, twitterImpressions: 1250 },
          anonymousUsername: 'Citizen_One',
          createdAt: new Date().toISOString(),
          isVerified: true,
          tweetUrl: 'https://twitter.com/CivicVigilance/status/1234567890'
        };

        const dummyComments: Comment[] = [
          { id: 'c1', reportId: id, userId: 'u2', content: 'I saw this too! It\'s getting worse.', createdAt: new Date(), edited: false },
          { id: 'c2', reportId: id, userId: 'u3', content: 'Has anyone reported this to the council?', createdAt: new Date(), edited: false },
          { id: 'c3', reportId: id, userId: 'u4', content: 'Yes, I tagged them on Twitter.', createdAt: new Date(), edited: false, parentId: 'c2' },
          { id: 'c4', reportId: id, userId: 'u5', content: 'Good job!', createdAt: new Date(), edited: false, parentId: 'c3' },
        ];

        if (!active) return;
        setIssue(dummyIssue);
        setComments(dummyComments);
        setUp(dummyIssue.metrics?.upvotes ?? 0);
        setDown(dummyIssue.metrics?.downvotes ?? 0);
        return;
      }

      if (getBackend() === 'sqlite') {
        const localIssue = mapLocalIssueRow(getIssueByIdSqlite(Number(id)));
        const localComments = listCommentsSqlite(Number(id)).map(mapLocalCommentRow);
        if (!active) return;
        setIssue(localIssue);
        setComments(localComments);
        setUp(localIssue.upvotes ?? 0);
        setDown(localIssue.downvotes ?? 0);
      } else {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
        const { data, error } = await supabase
          .from('issues')
          .select('*,issue_metrics(upvotes,downvotes,comments,shares,twitter_impressions)')
          .eq('id', id)
          .maybeSingle();
        if (error) {
          const details = [error.code, error.message].filter(Boolean).join(': ');
          throw new Error(details ? `Could not load this report (${details}).` : 'Could not load this report.');
        }
        if (!data) throw new Error('This report was not found or is not available to your account.');
        const mappedIssue = await mapDatabaseIssueRow(data);
        const { data: commentRows, error: commentsError } = await supabase
          .from('comments')
          .select('*')
          .eq('issue_id', id)
          .order('created_at', { ascending: true });
        if (commentsError) {
          const details = [commentsError.code, commentsError.message].filter(Boolean).join(': ');
          throw new Error(details ? `Could not load comments for this report (${details}).` : 'Could not load comments for this report.');
        }
        const mappedComments = (commentRows ?? []).map(mapDatabaseCommentRow);
        if (!active) return;
        setIssue(mappedIssue);
        setComments(mappedComments);
        setUp(mappedIssue.upvotes ?? 0);
        setDown(mappedIssue.downvotes ?? 0);
        if (session?.user?.id === mappedIssue.userId) {
          setEnhancementsLoading(true);
          void loadIssueEnhancements(id, session.user.id)
            .then((enhancements) => {
              if (active) setSavedEnhancements(enhancements);
            })
            .catch((cause) => {
              if (active) setEnhancementsError(cause instanceof Error
                ? cause.message
                : 'Could not load saved report assistance.');
            })
            .finally(() => {
              if (active) setEnhancementsLoading(false);
            });
        } else {
          setEnhancementsLoading(false);
        }
      }
      } catch (cause) {
        if (active) setLoadError(cause instanceof Error ? cause.message : 'Could not load this report.');
      }
    };
    void run();
    return () => { active = false; };
  }, [id, session?.user?.id, enhancementRetry]);

  useEffect(() => {
    let active = true;
    setVoteLoading(true);
    getUserVote(id).then((result) => {
      if (!active) return;
      if (result.status === 'ready') setVote(result.vote);
      else setVote(0);
      if (result.status === 'unauthenticated') {
        setVoteError('Sign in to vote on this report.');
      } else if (result.status === 'unconfigured') {
        setVoteError('Voting is unavailable because Supabase is not configured.');
      }
    }).catch(() => {
      if (active) Alert.alert('Vote unavailable', 'Could not load your vote. Please try again.');
    }).finally(() => {
      if (active) setVoteLoading(false);
    });
    return () => { active = false; };
  }, [id, localUserId]);

  const addComment = useCallback(async () => {
    if (isGuest) {
      import('react-native').then(({ Alert }) => {
        Alert.alert('Login Required', 'You need an account to post comments.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => void signOutForLogin() },
        ]);
      });
      return;
    }
    const trimmedContent = content.trim();
    if (!trimmedContent) return;
    if (!session?.user?.id) {
      setCommentError('Sign in before posting a comment.');
      return;
    }

    setCommentSubmitting(true);
    setCommentError(null);
    let commentSaved = false;
    try {
      if (getBackend() === 'sqlite') {
        addCommentSqlite(Number(id), localUserId, trimmedContent, replyTo ? Number(replyTo) : undefined);
        commentSaved = true;
        setContent('');
        setReplyTo(null);
        setComments(listCommentsSqlite(Number(id)).map(mapLocalCommentRow));
      } else {
        if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
        const commentPayload = {
          issue_id: id,
          user_id: session.user.id,
          content: trimmedContent,
          ...(replyTo ? { parent_id: replyTo } : {}),
        };
        const { error } = await supabase.from('comments').insert(commentPayload);
        if (error) throw new Error('Your comment could not be saved. Please try again.');
        commentSaved = true;
        setContent('');
        setReplyTo(null);

        const { data: rows, error: refreshError } = await supabase
          .from('comments')
          .select('*')
          .eq('issue_id', id)
          .order('created_at', { ascending: true });
        if (refreshError) throw new Error('Your comment was saved, but the comment list could not be refreshed.');
        setComments((rows ?? []).map(mapDatabaseCommentRow));
      }
      setContent('');
      setReplyTo(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Your comment could not be saved.';
      setCommentError(message);
      Alert.alert(commentSaved ? 'Comment saved' : 'Comment not sent', message);
    } finally {
      setCommentSubmitting(false);
    }
  }, [content, id, replyTo, localUserId, session?.user?.id, isGuest, signOut]);

  const onVote = async (val: -1 | 1) => {
    if (isGuest) {
      import('react-native').then(({ Alert }) => {
        Alert.alert('Login Required', 'You need an account to vote on issues.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => void signOutForLogin() },
        ]);
      });
      return;
    }
    if (voteSubmitting || voteLoading) return;
    const prev = vote;
    setVoteSubmitting(true);
    if (val === 1) {
      if (prev === 1) { setVote(0); setUp(Math.max(0, up - 1)); }
      else if (prev === -1) { setVote(1); setDown(Math.max(0, down - 1)); setUp(up + 1); }
      else { setVote(1); setUp(up + 1); }
    } else {
      if (prev === -1) { setVote(0); setDown(Math.max(0, down - 1)); }
      else if (prev === 1) { setVote(-1); setUp(Math.max(0, up - 1)); setDown(down + 1); }
      else { setVote(-1); setDown(down + 1); }
    }
    try {
      const res = await castVote(id, val);
      if (typeof res.upvotes === 'number') setUp(res.upvotes);
      if (typeof res.downvotes === 'number') setDown(res.downvotes);
      setVote(res.vote);
    } catch (cause) {
      setVote(prev);
      setUp(issue?.upvotes ?? up);
      setDown(issue?.downvotes ?? down);
      Alert.alert('Vote not saved', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setVoteSubmitting(false);
    }
  };

  // Memoize expensive computations
  const privacyIndicator = useMemo(() => {
    if (!issue) return null;
    const isPostedToTwitter = !!issue.tweetUrl;
    if (isPostedToTwitter) {
      return { icon: 'logo-twitter', text: 'Posted to Twitter', color: '#1DA1F2' };
    }
    return { icon: 'lock-closed', text: 'App Only', color: '#6B7280' };
  }, [issue?.tweetUrl]);

  const categoryEmoji = useMemo(() =>
    issue ? CATEGORY_EMOJIS[issue.category as keyof typeof CATEGORY_EMOJIS] || '⚠️' : '⚠️',
    [issue?.category]
  );

  const handleShare = useCallback(() => {
    if (!issue) return;
    const tweetText = composePostText({
      title: issue.title || '',
      description: issue.description,
      address: issue.address,
      lat: issue.lat,
      lng: issue.lng,
      category: issue.category,
    });
    showShareDialog({ text: tweetText, imageUri: issue.imageUrl });
  }, [id, issue]);

  const tree = useMemo(() => {
    const map = new Map<string, Comment[]>();
    const roots: Comment[] = [];
    comments.forEach(c => { map.set(c.id, []); });
    comments.forEach(c => {
      if (c.parentId) {
        const arr = map.get(c.parentId) || [];
        arr.push(c); map.set(c.parentId, arr);
      } else {
        roots.push(c);
      }
    });
    function renderNode(c: Comment, level = 0): React.ReactNode {
      const maxNestLevel = 5; // PRD: 5-level nesting max
      const actualLevel = Math.min(level, maxNestLevel);

      return (
        <View key={c.id} style={{
          paddingLeft: 8 + actualLevel * 12,
          paddingVertical: 12,
          borderLeftWidth: actualLevel > 0 ? 2 : 0,
          borderLeftColor: '#E5E7EB',
          marginBottom: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
            <Text style={{ fontWeight: '600', color: '#4B5563', marginLeft: 4, fontSize: 14 }}>
              Citizen
            </Text>
            <Text style={{ color: '#9CA3AF', marginLeft: 8, fontSize: 12 }}>
              {c.createdAt ? getTimeAgo(c.createdAt) : 'just now'}
            </Text>
          </View>
          <Text style={{ color: '#23272F', fontSize: 15, lineHeight: 22 }}>{c.content}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
            <Pressable onPress={() => {
              if (isGuest) {
                import('react-native').then(({ Alert }) => {
                  Alert.alert('Login Required', 'You need an account to reply.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign In', onPress: () => void signOutForLogin() },
                  ]);
                });
                return;
              }
              setReplyTo(c.id);
            }}>
              <Text style={{ color: '#2563EB', fontWeight: '600', fontSize: 14 }}>Reply</Text>
            </Pressable>
          </View>
          {(map.get(c.id) || []).map(child => renderNode(child, level + 1))}
        </View>
      );
    }
    return roots.map(r => renderNode(r));
  }, [comments]);

  if (!issue) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <Ionicons name="alert-circle-outline" size={64} color="#D1D5DB" />
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#6B7280', marginTop: 16 }}>Issue not found</Text>
        <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8 }}>
          {loadError || 'This issue may have been removed or is unavailable.'}
        </Text>
      </View>
    );
  }

  const tweetUrl = issue.tweetUrl;

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      {/* Full-size Photo */}
      {issue.imageUrl && (
        <Image
          source={{ uri: issue.imageUrl }}
          style={styles.heroImage}
          resizeMode="cover"
        />
      )}

      {/* Category + Title */}
      <View style={styles.headerSection}>
        <View style={styles.categoryRow}>
          <Text style={styles.categoryEmoji}>{categoryEmoji}</Text>
          <Text style={styles.categoryText}>
            {issue.category ? issue.category.replace(/_/g, ' ') : 'other'}
          </Text>
        </View>
        <Text style={styles.title}>{issue.title || 'Untitled Issue'}</Text>

        {/* User Info */}
        <View style={styles.userRow}>
          <Ionicons name="person-circle-outline" size={16} color="#6B7280" />
          <Text style={styles.username}>
            {issue.anonymousUsername || 'Anonymous_Citizen'}
            {issue.isVerified && ' ⭐'}
          </Text>
          <Text style={styles.separator}>•</Text>
          <Ionicons name="time-outline" size={16} color="#6B7280" />
          <Text style={styles.timeAgo}>{getTimeAgo(issue.createdAt)}</Text>
        </View>

        {/* Location */}
        {issue.address && (
          <View style={styles.locationRow}>
            <Ionicons name="location" size={16} color="#6B7280" />
            <Text style={styles.address}>{issue.address}</Text>
          </View>
        )}

        {/* Privacy/Twitter Badge */}
        {privacyIndicator && (
          <View style={styles.privacyRow}>
            <Ionicons name={privacyIndicator.icon as any} size={14} color={privacyIndicator.color} />
            <Text style={[styles.privacyText, { color: privacyIndicator.color }]}>
              {privacyIndicator.text}
            </Text>
          </View>
        )}

        {/* Description */}
        <Text style={styles.description}>{issue.description || 'No description provided.'}</Text>
      </View>

      {session?.user?.id === issue.userId && (
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', gap: 8 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#23272F' }}>Saved report assistance</Text>
          {enhancementsLoading && <Text style={{ color: '#6B7280' }}>Loading your saved suggestions and drafts…</Text>}
          {!!enhancementsError && (
            <View>
              <Text accessibilityRole="alert" style={{ color: '#B91C1C' }}>{enhancementsError}</Text>
              <Button title="Retry loading saved content" onPress={() => setEnhancementRetry((attempt) => attempt + 1)} variant="outline" />
            </View>
          )}
          {!enhancementsLoading && !enhancementsError && savedEnhancements?.authoritySuggestions.map((suggestion) => (
            <View key={suggestion.handle} style={{ gap: 4 }}>
              <Text style={{ color: '#374151', fontWeight: '600' }}>
                {suggestion.name} ({suggestion.handle}) · verified directory suggestion{suggestion.selected ? ' · selected for your editable draft' : ''}
              </Text>
              <Text style={{ color: '#6B7280' }}>{suggestion.matchReason}</Text>
              {!!suggestion.profileUrl && (
                <Text accessibilityRole="link" style={{ color: '#2563EB' }} onPress={() => void Linking.openURL(suggestion.profileUrl!)}>
                  Open account profile
                </Text>
              )}
              {!!suggestion.sourceUrl && (
                <Text accessibilityRole="link" style={{ color: '#2563EB' }} onPress={() => void Linking.openURL(suggestion.sourceUrl!)}>
                  Open listed verification source
                </Text>
              )}
            </View>
          ))}
          {!enhancementsLoading && !enhancementsError && savedEnhancements?.generatedContents.map((generated, index) => (
            <View key={`${generated.title}-${index}`} style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 4 }}>
              <Text style={{ color: '#1D4ED8', fontWeight: '600' }}>AI-generated draft {index + 1} · review before use</Text>
              <Text style={{ color: '#374151', fontWeight: '600' }}>{generated.title}</Text>
              <Text style={{ color: '#4B5563' }}>{generated.description}</Text>
              <Text style={{ color: '#6B7280' }}>{generated.awareness_caption}</Text>
              {generated.hashtags.length > 0 && <Text style={{ color: '#2563EB' }}>{generated.hashtags.join(' ')}</Text>}
            </View>
          ))}
          {!enhancementsLoading && !enhancementsError
            && !savedEnhancements?.authoritySuggestions.length
            && !savedEnhancements?.generatedContents.length
            && <Text style={{ color: '#6B7280' }}>No account suggestions or generated drafts were saved for this report.</Text>}
        </View>
      )}

      {/* Community Impact Section (PRD Section 5.4.2) */}
      <View style={styles.impactSection}>
        <Text style={styles.sectionTitle}>Community Impact</Text>
        <View style={styles.impactRow}>
          <View style={styles.impactItem}>
            <Ionicons name="arrow-up" size={24} color="#FF6B3D" />
            <Text style={styles.impactValue}>{formatCount(up)}</Text>
            <Text style={styles.impactLabel}>Upvotes</Text>
          </View>
          <View style={styles.impactItem}>
            <Ionicons name="chatbubble" size={24} color="#2563EB" />
            <Text style={styles.impactValue}>{formatCount(comments.length)}</Text>
            <Text style={styles.impactLabel}>Comments</Text>
          </View>
          <View style={styles.impactItem}>
            <Ionicons name="share-social" size={24} color="#34D399" />
            <Text style={styles.impactValue}>{formatCount(issue.shares || 0)}</Text>
            <Text style={styles.impactLabel}>Shares</Text>
          </View>
          {tweetUrl && issue.metrics?.twitterImpressions && (
            <View style={styles.impactItem}>
              <Ionicons name="logo-twitter" size={24} color="#1DA1F2" />
              <Text style={styles.impactValue}>{formatCount(issue.metrics.twitterImpressions)}</Text>
              <Text style={styles.impactLabel}>Views</Text>
            </View>
          )}
        </View>
      </View>

      {/* Twitter Amplification Card (if posted to Twitter) */}
      {tweetUrl && (
        <TouchableOpacity
          style={styles.twitterCard}
          onPress={() => Linking.openURL(tweetUrl)}
          activeOpacity={0.7}
        >
          <View style={styles.twitterCardHeader}>
            <Ionicons name="logo-twitter" size={20} color="#1DA1F2" />
            <Text style={styles.twitterCardTitle}>Amplified on Twitter</Text>
          </View>
          <Text style={styles.twitterCardSubtitle}>
            This issue has been posted to Twitter and tagged with relevant authorities
          </Text>
          <View style={styles.twitterCardButton}>
            <Text style={styles.twitterCardButtonText}>View Tweet</Text>
            <Ionicons name="open-outline" size={16} color="#1DA1F2" />
          </View>
        </TouchableOpacity>
      )}

      {/* Action Bar */}
      <View style={styles.actionBar}>
        {/* Vote Pill */}
        <View style={styles.votePill}>
          <Pressable onPress={() => onVote(1)} style={styles.pillBtn} hitSlop={8} disabled={voteLoading || voteSubmitting}>
            <Ionicons name={vote === 1 ? 'arrow-up' : 'arrow-up-outline'} size={20} color={vote === 1 ? '#FF4500' : '#E0E0E0'} />
          </Pressable>
          <Text style={[styles.voteCount, vote !== 0 && styles.voteCountActive]}>{formatCount(up)}</Text>
          <Pressable onPress={() => onVote(-1)} style={styles.pillBtn} hitSlop={8} disabled={voteLoading || voteSubmitting}>
            <Ionicons name={vote === -1 ? 'arrow-down' : 'arrow-down-outline'} size={20} color={vote === -1 ? '#7193FF' : '#E0E0E0'} />
          </Pressable>
        </View>

        {/* Share Pill */}
        <Pressable onPress={handleShare} style={styles.pill} hitSlop={8}>
          <Ionicons name="share-outline" size={18} color="#E0E0E0" />
          <Text style={styles.pillText}>Share</Text>
        </Pressable>
      </View>

      {/* Comments Section */}
      <View style={styles.commentsSection}>
        {voteError && <Text accessibilityRole="alert" style={styles.errorText}>{voteError}</Text>}
        {commentError && <Text accessibilityRole="alert" style={styles.errorText}>{commentError}</Text>}
        <Text style={styles.sectionTitle}>
          Comments ({comments.length})
        </Text>

        {comments.length === 0 ? (
          <View style={styles.emptyComments}>
            <Ionicons name="chatbubble-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyCommentsText}>No comments yet</Text>
            <Text style={styles.emptyCommentsSubtext}>Be the first to join the conversation</Text>
          </View>
        ) : (
          <View style={styles.commentsTree}>{tree}</View>
        )}
      </View>

      {/* Comment Input */}
      <View style={styles.commentInputSection}>
        {replyTo && (
          <View style={styles.replyingTo}>
            <Text style={styles.replyingToText}>Replying to comment...</Text>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="#6B7280" />
            </Pressable>
          </View>
        )}
        <View style={styles.inputRow}>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder={replyTo ? 'Write a reply...' : 'Join the conversation...'}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
            accessibilityLabel={replyTo ? 'Reply' : 'Comment'}
          />
          <Pressable
            onPress={addComment}
            style={[styles.sendButton, (!content.trim() || commentSubmitting) && styles.sendButtonDisabled]}
            disabled={!content.trim() || commentSubmitting}
          >
            <Ionicons name="send" size={20} color={content.trim() ? '#2563EB' : '#D1D5DB'} />
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    paddingBottom: 100,
  },
  heroImage: {
    width: '100%',
    height: 300,
    backgroundColor: '#F3F4F6',
  },
  headerSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#23272F',
    marginBottom: 12,
    lineHeight: 32,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  username: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  separator: {
    fontSize: 14,
    color: '#9CA3AF',
    marginHorizontal: 4,
  },
  timeAgo: {
    fontSize: 14,
    color: '#6B7280',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  address: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
  },
  privacyText: {
    fontSize: 12,
    fontWeight: '500',
  },
  description: {
    fontSize: 16,
    color: '#23272F',
    lineHeight: 24,
  },
  impactSection: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#23272F',
    marginBottom: 12,
  },
  impactRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  impactItem: {
    alignItems: 'center',
    flex: 1,
  },
  impactValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#23272F',
    marginTop: 4,
  },
  impactLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  twitterCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  twitterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  twitterCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
  },
  twitterCardSubtitle: {
    fontSize: 14,
    color: '#3B82F6',
    marginBottom: 12,
    lineHeight: 20,
  },
  twitterCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  twitterCardButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1DA1F2',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // Reduced gap for pills
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  votePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a', // Dark pill
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
  },
  pillBtn: {
    padding: 6,
  },
  voteCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF', // White text
    minWidth: 20,
    textAlign: 'center',
  },
  voteCountActive: {
    color: '#FF4500',
  },
  // Reusing generic 'pill' style for Share button
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#27272a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E0E0E0',
  },
  // Keeping old styles just in case but they won't be used if we update JSX
  voteButton: { display: 'none' },
  shareButton: { display: 'none' },
  shareText: { display: 'none' },
  commentsSection: {
    padding: 16,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    marginBottom: 8,
  },
  commentsTree: {
    marginTop: 12,
  },
  emptyComments: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyCommentsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyCommentsSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  commentInputSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  replyingTo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  replyingToText: {
    fontSize: 14,
    color: '#2563EB',
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: '#23272F',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
});
