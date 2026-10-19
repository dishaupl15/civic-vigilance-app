/**
 * Stage 5: Success Celebration
 *
 * Features:
 * - Celebratory UI with animation
 * - Summary of what happened
 * - Share on X button if user chose App Only
 * - Share More for multi-platform sharing
 * - Action buttons (View Post, Share More, Done)
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/ui/Button';
import { TwitterPostingMethod } from '../../types';
import { Colors, Shadows, Typography, BorderRadius } from '../../constants/DesignSystem';

interface Props {
  issueId: string;
  privacy: TwitterPostingMethod;
  tweetUrl?: string;
  externalComposerOpened?: boolean;
  onViewPost: () => void;
  onShareMore: () => void;
  onDone: () => void;
}

export default function Stage5SuccessScreen({
  issueId,
  privacy,
  tweetUrl,
  externalComposerOpened,
  onViewPost,
  onShareMore,
  onDone,
}: Props) {
  const scaleAnim = new Animated.Value(0);
  const fadeAnim = new Animated.Value(0);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      {/* Success Icon with Animation */}
      <Animated.View
        style={[
          styles.iconContainer,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={64} color="#fff" />
        </View>
      </Animated.View>

      {/* Success Message */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.title}>{privacy === 'none' ? 'Private Report Saved' : 'Issue Reported'}</Text>
        <Text style={styles.subtitle}>{privacy === 'none' ? 'Only you can access this report.' : 'Your report is now in the community feed.'}</Text>

        {/* What Happened Summary */}
        <View style={styles.summaryBox}>
          {privacy === 'twitter' && (
            <View style={styles.summaryRow}>
              <Ionicons name="logo-twitter" size={20} color="#1DA1F2" />
              <Text style={styles.summaryText}>
                {externalComposerOpened ? 'X/Twitter composer opened — publication is not confirmed' : 'Not published to X/Twitter'}
              </Text>
            </View>
          )}

          <View style={styles.summaryRow}>
            <Ionicons name={privacy === 'none' ? 'lock-closed' : 'people'} size={20} color="#2563EB" />
            <Text style={styles.summaryText}>{privacy === 'none' ? 'Not visible in the public feed' : 'Visible to your community'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Ionicons name="megaphone" size={20} color="#7C3AED" />
            <Text style={styles.summaryText}>Others can upvote to amplify</Text>
          </View>
        </View>

        {/* Prompt to share if user chose App Only */}
        {privacy === 'none' && (
          <View style={styles.sharePromptBox}>
            <Ionicons name="logo-twitter" size={24} color="#1DA1F2" />
            <View style={{ flex: 1 }}>
              <Text style={styles.sharePromptTitle}>Amplify your issue!</Text>
              <Text style={styles.sharePromptText}>
                Share on X/Twitter to tag authorities and get faster attention.
              </Text>
            </View>
          </View>
        )}

        {/* Call to Action */}
        <View style={styles.ctaBox}>
          <Text style={styles.ctaTitle}>The more upvotes, the harder to ignore.</Text>
          <Text style={styles.ctaText}>
            Share with neighbors to get more attention on this issue!
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Button
            title="View Post"
            onPress={onViewPost}
            style={styles.primaryButton}
          />

          <Button
            title="Share More"
            onPress={onShareMore}
            variant="outline"
            style={styles.secondaryButton}
          />

          <Pressable onPress={onDone} style={styles.doneButton}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconContainer: {
    marginBottom: 32,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.lg,
    shadowColor: Colors.success,
  },
  content: {
    width: '100%',
    alignItems: 'center',
  },
  title: {
    ...Typography.h1,
    marginBottom: 8,
  },
  subtitle: {
    ...Typography.body,
    marginBottom: 32,
  },
  summaryBox: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 20,
    gap: 16,
    marginBottom: 24,
    ...Shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryText: {
    flex: 1,
    ...Typography.bodySm,
  },
  sharePromptBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderDark,
  },
  sharePromptTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: Typography.h4.fontWeight,
    color: Colors.primaryDark,
    marginBottom: 4,
  },
  sharePromptText: {
    ...Typography.caption,
    color: Colors.primaryDark,
  },
  ctaBox: {
    width: '100%',
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.md,
    padding: 16,
    marginBottom: 32,
  },
  ctaTitle: {
    fontSize: Typography.h4.fontSize,
    fontWeight: Typography.h4.fontWeight,
    color: Colors.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  ctaText: {
    ...Typography.bodySm,
    color: Colors.error,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    width: '100%',
  },
  secondaryButton: {
    width: '100%',
  },
  doneButton: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  doneText: {
    ...Typography.button,
    color: Colors.textSecondary,
  },
});
