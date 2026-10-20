import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { IssueWithUserData } from '../types';
import { castVote, getUserVote } from '../lib/votes';
import { composePostText, shareImageWithText, openTweetComposer } from '../lib/sharing';
import ActionBar from './ActionBar';
import { Colors } from '../constants/DesignSystem';
import { useAuth } from '../hooks/useAuth';
import { Alert } from 'react-native';

export default function IssueCard({ item, onPress }: { item: IssueWithUserData; onPress?: () => void }) {
  const { isGuest, signOut } = useAuth();
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [voteLoading, setVoteLoading] = useState(true);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [up, setUp] = useState(item.upvotes ?? 0);
  const [down, setDown] = useState(item.downvotes ?? 0);
  const signOutForLogin = async () => {
    const result = await signOut();
    if (result?.error) Alert.alert('Logout failed', result.error);
  };

  useEffect(() => {
    let active = true;
    getUserVote(item.id).then((result) => {
      if (!active) return;
      setVote(result.status === 'ready' ? result.vote : 0);
    }).catch(() => {
      if (active) Alert.alert('Vote unavailable', 'Could not load your vote. Please try again.');
    }).finally(() => {
      if (active) setVoteLoading(false);
    });
    return () => { active = false; };
  }, [item.id]);

  const onVote = async (val: -1 | 1) => {
    if (voteLoading || voteSubmitting) return;
    if (isGuest) {
      Alert.alert('Login Required', 'You need an account to vote on issues.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => void signOutForLogin() },
      ]);
      return;
    }
    setVoteSubmitting(true);
    const prev = vote;
    // optimistic update
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
      const res = await castVote(item.id, val);
      if (typeof res.upvotes === 'number') setUp(res.upvotes);
      if (typeof res.downvotes === 'number') setDown(res.downvotes);
      setVote(res.vote);
      if (res.warning) Alert.alert('Vote saved', res.warning);
    } catch (cause) {
      setVote(prev);
      setUp(item.upvotes ?? 0);
      setDown(item.downvotes ?? 0);
      Alert.alert('Vote not saved', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setVoteSubmitting(false);
    }
  };

  const onShare = async () => {
    const text = composePostText({ description: item.title + '\n' + (item.address || ''), address: item.address, lat: item.lat, lng: item.lng });
    if (item.imageUrl) await shareImageWithText(item.imageUrl, text); else await openTweetComposer(text);
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Open issue ${item.title}`}
      hitSlop={6}
    >
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.image} />
      ) : null}
      <View style={styles.content}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta} numberOfLines={2}>
          {item.address || item.description}
        </Text>
        <ActionBar vote={vote} upvotes={up} downvotes={down} comments={item.commentsCount ?? 0} onUpvote={() => onVote(1)} onDownvote={() => onVote(-1)} onComment={onPress} onShare={onShare} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderRadius: 20, overflow: 'hidden', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.12)' },
  image: { width: '100%', height: 200 },
  content: { padding: 16 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 6, color: Colors.textMain },
  meta: { color: Colors.textSecondary },
  row: { flexDirection: 'row', marginTop: 10, gap: 12 },
  stat: { flexDirection: 'row', alignItems: 'center' }
});
