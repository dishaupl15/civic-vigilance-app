/**
 * Enhanced Issue Card - PRD Section 5.3.2 Compliant
 *
 * Design Specs:
 * - Card Dimensions: 100% width, min-height 280px, 12px radius
 * - Shadow: box-shadow: 0 2px 8px rgba(0,0,0,0.1)
 * - Background: Soft White (#F4F4F5)
 * - Padding: 16px all sides
 *
 * Elements:
 * - Category emoji + title
 * - Photo thumbnail (16:9 ratio)
 * - Distance + address
 * - Username (with ⭐ if verified)
 * - Time ago
 * - Twitter indicator (🐦 Posted / 🔒 App Only)
 * - Vote arrows + count
 * - Comment count + Share button
 */

import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IssueWithUserData } from '../types';
import { castVote, getUserVote } from '../lib/votes';
import { formatCount, getTimeAgo, formatDistance } from '../lib/format';
import { composePostText, showShareDialog } from '../lib/sharingEnhanced';
import { CATEGORY_EMOJIS } from './CategoryPicker';
import { useAuth } from '../hooks/useAuth';

interface Props {
  item: IssueWithUserData;
  onPress?: () => void;
  distance?: number; // Distance in km (for nearby sort)
}

function EnhancedIssueCard({ item, onPress, distance }: Props) {
  const { isGuest, signOut, session } = useAuth();
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [voteLoading, setVoteLoading] = useState(true);
  const [voteSubmitting, setVoteSubmitting] = useState(false);
  const [upvotes, setUpvotes] = useState(item.upvotes ?? 0);
  const [downvotes, setDownvotes] = useState(item.downvotes ?? 0);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    let active = true;
    setVoteLoading(true);
    getUserVote(item.id).then((result) => {
      if (active) setVote(result.status === 'ready' ? result.vote : 0);
    }).catch(() => {
      if (active) Alert.alert('Vote unavailable', 'Could not load your vote. Please try again.');
    }).finally(() => {
      if (active) setVoteLoading(false);
    });
    return () => { active = false; };
  }, [item.id, session?.user?.id]);

  useEffect(() => {
    setUpvotes(item.upvotes ?? 0);
    setDownvotes(item.downvotes ?? 0);
  }, [item.id, item.upvotes, item.downvotes]);

  const onVote = useCallback(async (val: -1 | 1) => {
    if (voteLoading || voteSubmitting) return;
    if (isGuest) {
      Alert.alert('Login Required', 'You need an account to vote on issues.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign In', onPress: () => signOut() },
      ]);
      return;
    }
    setVoteSubmitting(true);
    const prev = vote;
    if (val === 1) {
      if (prev === 1) {
        setVote(0);
        setUpvotes(Math.max(0, upvotes - 1));
      } else if (prev === -1) {
        setVote(1);
        setDownvotes(Math.max(0, downvotes - 1));
        setUpvotes(upvotes + 1);
      } else {
        setVote(1);
        setUpvotes(upvotes + 1);
      }
    } else if (prev === -1) {
      setVote(0);
      setDownvotes(Math.max(0, downvotes - 1));
    } else if (prev === 1) {
      setVote(-1);
      setUpvotes(Math.max(0, upvotes - 1));
      setDownvotes(downvotes + 1);
    } else {
      setVote(-1);
      setDownvotes(downvotes + 1);
    }

    try {
      const res = await castVote(item.id, val);
      if (typeof res.upvotes === 'number') setUpvotes(res.upvotes);
      if (typeof res.downvotes === 'number') setDownvotes(res.downvotes);
      setVote(res.vote);
      if (res.warning) Alert.alert('Vote saved', res.warning);
    } catch (cause) {
      setVote(prev);
      setUpvotes(item.upvotes ?? 0);
      setDownvotes(item.downvotes ?? 0);
      Alert.alert('Vote not saved', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setVoteSubmitting(false);
    }
  }, [vote, upvotes, downvotes, item.id, item.upvotes, item.downvotes, voteLoading, voteSubmitting, isGuest, signOut]);

  const categoryEmoji = useMemo(() =>
    CATEGORY_EMOJIS[item.category as keyof typeof CATEGORY_EMOJIS] || '⚠️',
    [item.category]
  );

  const privacyIndicator = useMemo(() => {
    const isPostedToTwitter = !!item.tweetUrl;
    if (isPostedToTwitter) {
      return { icon: 'logo-twitter', text: 'Posted to Twitter', color: '#1DA1F2' };
    }
    return { icon: 'lock-closed', text: 'App Only', color: '#6B7280' };
  }, [item.tweetUrl]);

  const timeAgo = useMemo(() => getTimeAgo(item.createdAt), [item.createdAt]);
  const formattedDistance = useMemo(() => formatDistance(distance), [distance]);

  const handleShare = useCallback(() => {
    const text = composePostText({
      title: item.title,
      description: item.description,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
      category: item.category,
    });
    showShareDialog({ text, imageUri: item.imageUrl });
  }, [item.title, item.description, item.address, item.lat, item.lng, item.category, item.imageUrl]);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`Issue: ${item.title}, ${upvotes} upvotes`}
      activeOpacity={0.7}
    >
      {/* Category Emoji + Title */}
      <View style={styles.titleRow}>
        <Text style={styles.categoryEmoji}>{categoryEmoji}</Text>
        <Text style={styles.category}>{item.category.replace(/_/g, ' ')}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>

      {/* Photo Thumbnail (16:9 ratio) */}
      {item.imageUrl && !imageError && (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.photo}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      )}
      {item.imageUrl && imageError && (
        <View style={[styles.photo, { justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="image-outline" size={40} color={Colors.textMuted} />
          <Text style={{ ...Typography.caption, color: Colors.textMuted, marginTop: 4 }}>Image unavailable</Text>
        </View>
      )}

      {/* Metadata Row */}
      <View style={styles.metaRow}>
        {distance !== undefined && formattedDistance !== '' && (
          <View style={styles.metaItem}>
            <Ionicons name="location" size={14} color="#6B7280" />
            <Text style={styles.metaText}>{formattedDistance}</Text>
          </View>
        )}
        <View style={[styles.metaItem, { flex: 1 }]}>
          <Ionicons name="location-outline" size={14} color="#6B7280" />
          <Text style={styles.metaText} numberOfLines={1}>
            {item.address || 'Location unknown'}
          </Text>
        </View>
      </View>

      {/* User + Time Row */}
      <View style={styles.userRow}>
        <Ionicons name="person-circle-outline" size={14} color="#6B7280" />
        <Text style={styles.username}>
          {item.anonymousUsername || 'Anonymous_Citizen'}
          {item.isVerified && ' ⭐'}
        </Text>
        <Text style={styles.separator}>•</Text>
        <Ionicons name="time-outline" size={14} color="#6B7280" />
        <Text style={styles.timeAgo}>{timeAgo}</Text>
      </View>

      {/* Twitter Indicator */}
      <View style={styles.privacyRow}>
        <Ionicons name={privacyIndicator.icon as any} size={12} color={privacyIndicator.color} />
        <Text style={[styles.privacyText, { color: privacyIndicator.color }]}>
          {privacyIndicator.text}
        </Text>
      </View>

      {/* Action Bar - Reddit Style Pills */}
      <View style={styles.actionBar}>
        <View style={styles.votePill}>
          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              void onVote(1);
            }}
            style={styles.pillBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Upvote"
            accessibilityState={{ selected: vote === 1, disabled: voteLoading || voteSubmitting }}
            testID={`upvote-${item.id}`}
            disabled={voteLoading || voteSubmitting}
          >
            <Ionicons
              name={vote === 1 ? 'arrow-up' : 'arrow-up-outline'}
              size={20}
              color={vote === 1 ? '#FF4500' : '#E0E0E0'}
            />
          </Pressable>

          <Text style={[styles.voteCount, vote !== 0 && styles.voteCountActive]}>
            {formatCount(upvotes)}
          </Text>

          <Pressable
            onPress={(event) => {
              event.stopPropagation();
              void onVote(-1);
            }}
            style={styles.pillBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Downvote"
            accessibilityState={{ selected: vote === -1, disabled: voteLoading || voteSubmitting }}
            testID={`downvote-${item.id}`}
            disabled={voteLoading || voteSubmitting}
          >
            <Ionicons
              name={vote === -1 ? 'arrow-down' : 'arrow-down-outline'}
              size={20}
              color={vote === -1 ? '#7193FF' : '#E0E0E0'}
            />
          </Pressable>
        </View>

        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onPress?.();
          }}
          style={styles.pill}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open comments"
        >
          <Ionicons name="chatbubble-outline" size={18} color="#E0E0E0" />
          <Text style={styles.pillText}>{formatCount(item.commentsCount || 0)}</Text>
        </Pressable>

        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            handleShare();
          }}
          style={styles.pill}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Share report"
          testID={`share-${item.id}`}
        >
          <Ionicons name="share-outline" size={18} color="#E0E0E0" />
          <Text style={styles.pillText}>Share</Text>
        </Pressable>
      </View>
    </TouchableOpacity>
  );
}

import { Colors, Typography, Spacing, Shadows, BorderRadius, Layout } from '../constants/DesignSystem';

const styles = StyleSheet.create({
  card: {
    ...Layout.card,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface, // Explicit surface
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center', // Fix alignment
    marginBottom: Spacing.sm,
  },
  categoryEmoji: {
    fontSize: 20,
    marginRight: Spacing.sm,
  },
  category: {
    ...Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    ...Typography.h3,
    marginBottom: Spacing.md,
    lineHeight: 28, // Better line height for titles
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.md, // 12px
    marginBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: 6,
  },
  username: {
    ...Typography.bodySm,
    fontWeight: '600',
    color: Colors.textMain,
  },
  separator: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  timeAgo: {
    ...Typography.bodySm,
    color: Colors.textMuted,
  },
  privacyRow: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.glass, // Glassmorphism indicator
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  privacyText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  votePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background, // Lighter background for action pills
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillBtn: {
    padding: 6,
  },
  voteCount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textMain, // Dark text on light pill (Modern look)
    minWidth: 20,
    textAlign: 'center',
  },
  voteCountActive: {
    color: Colors.primary, // Blue for active upvote
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});

// Export memoized component for better performance
export default memo(EnhancedIssueCard);
