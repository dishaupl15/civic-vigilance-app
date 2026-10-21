/**
 * Stage 4: Preview & Submit
 * PRD Section 5.2 - Stage 4: Preview & Submit
 *
 * Features:
 * - Mock tweet card preview (if Twitter posting)
 * - Authority tag list (editable)
 * - Information box about what happens next
 * - Navigation to edit previous stages
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/ui/Button';
import { ReportSharingMethod, CategoryKey } from '../../types';
import { MatchedAuthority } from '../../lib/smartAuthorities';
import { Colors, Shadows, Typography, BorderRadius } from '../../constants/DesignSystem';
import { formatBlueskyPostPreview } from '../../lib/blueskyApi';

interface Props {
  photos: string[];
  title: string;
  description: string;
  category: CategoryKey;
  address: string;
  coords: { lat: number; lng: number } | null;
  selectedAuthorityHandles: string[];
  authoritySuggestions: MatchedAuthority[];
  privacy: ReportSharingMethod;
  onSubmit: () => void;
  onBack: () => void;
  onEditDetails: () => void;
  onEditPrivacy: () => void;
}

// Category emoji mapping (PRD Section 16.1)
const CATEGORY_EMOJIS: Record<CategoryKey, string> = {
  pothole: '🚧',
  garbage: '🗑️',
  streetlight: '💡',
  drainage: '🌊',
  water_supply: '💧',
  sewage: '🚰',
  traffic_signal: '🚦',
  encroachment: '🚧',
  stray_animals: '🐕',
  parks: '🌳',
  other: '⚠️',
};

export default function Stage4PreviewScreen({
  photos,
  title,
  description,
  category,
  address,
  coords,
  selectedAuthorityHandles,
  authoritySuggestions,
  privacy,
  onSubmit,
  onBack,
  onEditDetails,
  onEditPrivacy,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authorities = useMemo(() => {
    return authoritySuggestions.filter((authority) => selectedAuthorityHandles.includes(authority.handle));
  }, [authoritySuggestions, selectedAuthorityHandles]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit();
    } catch (error) {
      console.error('[Preview] Submit error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate mock tweet text (PRD Section 16.2)
  const generateTweetText = () => {
    const emoji = CATEGORY_EMOJIS[category];
    const dateStr = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    let tweetText = `${emoji} ${category.replace(/_/g, ' ')} reported on ${dateStr}\n`;
    tweetText += `📍 ${address}\n`;
    if (coords) {
      tweetText += `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}\n`;
      tweetText += `Location: https://maps.google.com/?q=${coords.lat},${coords.lng}\n\n`;
    }

    // Add authorities
    if (authorities.length > 0) {
      tweetText += `${authorities.map((authority) => authority.handle).join(' ')}\n\n`;
    }

    // Add description or title
    tweetText += `${description || title}\n\n`;
    tweetText += `Reported via CivicVigilance\n`;
    tweetText += `#CivicVigilance #${category}`;

    return tweetText;
  };

  const tweetText = privacy === 'twitter' ? generateTweetText() : null;
  const blueskyText = privacy === 'bluesky' ? formatBlueskyPostPreview(title, description) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Review Your Report</Text>
        <Text style={styles.headerSubtitle}>
          Preview how your issue will appear before posting
        </Text>
      </View>

      {/* Mock Tweet Card (if Twitter posting) */}
      {tweetText && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🐦 Twitter Preview</Text>
            <Pressable onPress={onEditPrivacy}>
              <Text style={styles.editLink}>Change</Text>
            </Pressable>
          </View>

          <View style={styles.tweetCard}>
            {/* Tweet Header */}
            <View style={styles.tweetHeader}>
              <View style={styles.tweetAvatar}>
                <View style={[styles.avatarPlaceholder, { backgroundColor: '#1DA1F2' }]}>
                  <Ionicons name="person" size={20} color="#fff" />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.tweetUserRow}>
                  <Text style={styles.tweetDisplayName}>Your Account</Text>
                  <Text style={styles.tweetHandle}>@you · Now</Text>
                </View>
              </View>
              <Ionicons name="logo-twitter" size={20} color="#1DA1F2" />
            </View>

            {/* Tweet Body */}
            <Text style={styles.tweetText}>{tweetText}</Text>

            {/* Photo Preview */}
            {photos.length > 0 && (
              <View style={styles.tweetMediaContainer}>
                {photos.slice(0, 4).map((photo, index) => (
                  <Image
                    key={index}
                    source={{ uri: photo }}
                    style={[
                      styles.tweetPhoto,
                      photos.length === 1 ? styles.tweetPhotoSingle : styles.tweetPhotoGrid
                    ]}
                    resizeMode="cover"
                  />
                ))}
              </View>
            )}

            {/* Tweet Actions Mock */}
            <View style={styles.tweetActions}>
              <Ionicons name="chatbubble-outline" size={18} color="#657786" />
              <Ionicons name="repeat-outline" size={18} color="#657786" />
              <Ionicons name="heart-outline" size={18} color="#657786" />
              <Ionicons name="share-outline" size={18} color="#657786" />
            </View>
          </View>

          <Text style={styles.privacyNote}>
            ✅ Will open in Twitter/X for you to post
          </Text>
        </View>
      )}

      {blueskyText && (
        <View style={styles.section} testID="bluesky-report-preview">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🦋 Bluesky Preview</Text>
            <Pressable onPress={onEditPrivacy}>
              <Text style={styles.editLink}>Change</Text>
            </Pressable>
          </View>
          <View style={styles.tweetCard}>
            <View style={styles.tweetHeader}>
              <View style={styles.tweetAvatar}>
                <View style={[styles.avatarPlaceholder, { backgroundColor: '#0085FF' }]}>
                  <Ionicons name="share-social-outline" size={20} color="#fff" />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tweetDisplayName}>Civic Vigilance</Text>
                <Text style={styles.tweetHandle}>Official account · Public post</Text>
              </View>
            </View>
            <Text style={styles.tweetText} testID="bluesky-preview-text">{blueskyText}</Text>
            {photos[0] ? (
              <View style={styles.tweetMediaContainer}>
                <Image
                  source={{ uri: photos[0] }}
                  style={[styles.tweetPhoto, styles.tweetPhotoSingle]}
                  resizeMode="cover"
                  accessibilityLabel="Photo that will be published publicly on Bluesky"
                />
              </View>
            ) : null}
          </View>
          <Text style={styles.privacyNote}>
            Review the text and photo carefully. Your report will be saved first; on the next screen, explicitly confirm publication through the administrator-configured official account. No personal Bluesky login is needed.
          </Text>
        </View>
      )}

      {/* Authorities Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📢 Selected account suggestions</Text>
          <Pressable onPress={onEditDetails}>
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>

        <View style={styles.authoritiesList}>
          {authorities.map((authority) => (
            <View key={authority.handle} style={styles.authorityChip}>
              <Ionicons name="at" size={16} color="#2563EB" />
              <Text style={styles.authorityText}>{authority.handle.replace('@', '')}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.hintText}>
          {authorities.length === 0
            ? 'No account suggestions selected. No authority will be contacted by Civic Vigilance.'
            : 'Selected directory accounts are included only in your editable X draft. Confirm each account on its official website; the app does not contact them.'}
        </Text>

        <Text style={styles.hintText}>
          📍 Based on your location in {address.split(',')[1]?.trim() || 'your area'}
        </Text>
      </View>

      {/* Issue Details Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📋 Issue Details</Text>
          <Pressable onPress={onEditDetails}>
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>

        <View style={styles.detailsBox}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Title:</Text>
            <Text style={styles.detailValue}>{title}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category:</Text>
            <Text style={styles.detailValue}>
              {CATEGORY_EMOJIS[category]} {category.replace(/_/g, ' ')}
            </Text>
          </View>
          {description && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Description:</Text>
              <Text style={styles.detailValue}>{description}</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{address}</Text>
          </View>
        </View>
      </View>

      {/* What Happens Next */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={24} color="#2563EB" />
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>ℹ️ What happens after you post?</Text>
          <Text style={styles.infoText}>
            ✅ Your issue appears in CivicVigilance feed{'\n'}
            {privacy === 'twitter' && authorities.length > 0 && '✅ Selected handles appear in your editable X draft\n'}
            ✅ Community can upvote to amplify{'\n'}
            ✅ More upvotes = More visibility{'\n\n'}
            ⚠️ Note: We don't track government action.{'\n'}
            We give your issue a louder voice.
          </Text>
        </View>
      </View>

      <View style={{ height: 120 }} />

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <Button title="← Back" onPress={onBack} variant="outline" style={{ flex: 1 }} />
        <Button
          title={isSubmitting ? 'Posting...' : 'Post Issue'}
          onPress={handleSubmit}
          style={{ flex: 2 }}
          disabled={isSubmitting}
        />
      </View>

      {isSubmitting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Posting your issue...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: Colors.background,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.h2,
    marginBottom: 8,
  },
  headerSubtitle: {
    ...Typography.bodySm,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    ...Typography.h4,
  },
  editLink: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  tweetCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tweetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tweetAvatar: {
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tweetUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tweetDisplayName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textMain,
    marginRight: 2,
  },
  tweetHandle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  tweetText: {
    ...Typography.body,
    marginBottom: 12,
  },
  tweetMediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tweetPhoto: {
    backgroundColor: Colors.border,
  },
  tweetPhotoSingle: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.md,
  },
  tweetPhotoGrid: {
    width: '48%',
    height: 120,
    borderRadius: BorderRadius.sm,
  },
  tweetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 4,
  },
  privacyNote: {
    fontSize: 13,
    color: Colors.success,
    marginTop: 8,
  },
  authoritiesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  authorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.lg,
    gap: 4,
  },
  authorityText: {
    fontSize: 14,
    color: Colors.primaryDark,
    fontWeight: '500',
  },
  hintText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  detailsBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    color: Colors.textMain,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    padding: 16,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primaryDark,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: Colors.primaryDark,
    lineHeight: 20,
  },
  bottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: BorderRadius.md,
    ...Shadows.lg,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textInverse,
    fontSize: 16,
    marginTop: 12,
  },
});
