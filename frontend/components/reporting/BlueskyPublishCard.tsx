import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Colors, BorderRadius, Typography } from '../../constants/DesignSystem';
import {
  BlueskyAvailability,
  formatBlueskyPostPreview,
  getBlueskyAvailability,
  publishIssueToBluesky,
} from '../../lib/blueskyApi';

interface Props {
  issueId: string;
  title: string;
  description: string;
  photoUri?: string;
}

export default function BlueskyPublishCard({ issueId, title, description, photoUri }: Props) {
  const previewText = formatBlueskyPostPreview(title, description);
  const [publishing, setPublishing] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [postUri, setPostUri] = useState('');
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [availability, setAvailability] = useState<BlueskyAvailability | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState('');
  const requestInProgress = useRef(false);

  const refreshAvailability = useCallback(async () => {
    setCheckingAvailability(true);
    setAvailabilityError('');
    try {
      const result = await getBlueskyAvailability(issueId);
      setAvailability(result);
      if (result.alreadyPublished && result.postUrl) setPostUrl(result.postUrl);
    } catch (statusError) {
      setAvailability(null);
      setAvailabilityError(statusError instanceof Error
        ? statusError.message
        : 'Could not check Bluesky publishing availability.');
    } finally {
      setCheckingAvailability(false);
    }
  }, [issueId]);

  useEffect(() => {
    void refreshAvailability();
  }, [refreshAvailability]);

  const publish = async () => {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    setPublishing(true);
    setError('');
    try {
      const publication = await publishIssueToBluesky(issueId);
      setPostUrl(publication.postUrl);
      setPostUri(publication.postUri || '');
      if (publication.alreadyPublished) {
        setError('This report was already published. No duplicate post was created.');
      } else {
        setPublicationConfirmed(true);
      }
    } catch (publishError) {
      setError(publishError instanceof Error
        ? publishError.message
        : 'Bluesky publication failed. Check your connection and try again.');
    } finally {
      requestInProgress.current = false;
      setPublishing(false);
    }
  };

  const confirmPublish = () => {
    if (publishing || postUrl) return;
    setConfirming(true);
  };

  const openPost = async () => {
    try {
      await Linking.openURL(postUrl);
    } catch {
      setError('Could not open the Bluesky post link on this device.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Share on Bluesky</Text>
      <Text style={styles.disclosure}>
        Preview for the official Civic Vigilance account. Publishing is optional and will be public.
        Structured location fields are not added. Review the description and photo for addresses or personal details before publishing.
      </Text>
      <View style={styles.preview}>
        <View style={styles.accountIdentity}>
          <Text style={styles.accountName}>Civic Vigilance</Text>
          <Text style={styles.accountHandle}>
            {availability?.accountHandle || 'Official account'} · Bluesky
          </Text>
        </View>
        {photoUri?.startsWith('https://')
          ? <Image source={{ uri: photoUri }} style={styles.photo} accessibilityLabel="Photo to be shared publicly" />
          : null}
        <Text style={styles.previewText}>{previewText}</Text>
        <Text style={styles.characterCount}>{Array.from(previewText).length}/300 characters</Text>
        {!photoUri?.startsWith('https://')
          ? <Text style={styles.noPhoto}>No public photo is available; this will be a text-only post.</Text>
          : null}
      </View>
      {checkingAvailability ? (
        <Text accessibilityRole="text" style={styles.statusText}>Checking official account and report eligibility…</Text>
      ) : availabilityError ? (
        <View>
          <Text accessibilityRole="alert" style={styles.error}>{availabilityError}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void refreshAvailability(); }} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Check again</Text>
          </Pressable>
        </View>
      ) : availability && !availability.configured ? (
        <Text style={styles.statusText}>
          The official Civic Vigilance Bluesky account is not configured on the backend. Contact the administrator.
        </Text>
      ) : availability && !availability.migrationReady ? (
        <Text style={styles.statusText}>
          Bluesky publishing is temporarily unavailable because the backend publication setup is incomplete. Contact the administrator.
        </Text>
      ) : availability?.alreadyPublished ? (
        <Text style={styles.statusText}>This report has already been published on Bluesky.</Text>
      ) : availability && !availability.eligible ? (
        <Text style={styles.statusText}>{availabilityMessage(availability.reason)}</Text>
      ) : availability?.eligible ? (
        <Text style={styles.statusText}>
          Official account configuration is present; the credentials are verified by Bluesky when publication is requested.
        </Text>
      ) : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {publicationConfirmed ? (
        <Text accessibilityRole="alert" style={styles.success}>
          Bluesky confirmed publication by the official account.
          {postUri ? ` Post ID: ${postUri}` : ''}
        </Text>
      ) : null}
      {confirming && !postUrl ? (
        <View style={styles.confirmation}>
          <Text style={styles.confirmationText}>
              Your report will be posted publicly with its selected photo by the official Civic Vigilance Bluesky account. You do not need a personal Bluesky login.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={publishing}
            onPress={() => { void publish(); }}
            style={[styles.publishButton, publishing && styles.disabledButton]}
            testID="confirm-bluesky"
          >
            <Text style={styles.publishText}>{publishing ? 'Publishing…' : 'Confirm public post'}</Text>
          </Pressable>
          {!publishing ? (
            <Pressable accessibilityRole="button" onPress={() => setConfirming(false)} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {postUrl ? (
        <Pressable accessibilityRole="link" onPress={() => { void openPost(); }} style={styles.linkButton}>
          <Text style={styles.linkText}>View published Bluesky post</Text>
        </Pressable>
      ) : !confirming ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: publishing || checkingAvailability || !availability?.eligible }}
          disabled={publishing || checkingAvailability || !availability?.eligible}
          onPress={confirmPublish}
          style={[styles.publishButton, publishing && styles.disabledButton]}
          testID="publish-bluesky"
        >
          <Text style={styles.publishText}>{publishing ? 'Publishing…' : 'Publish publicly on Bluesky'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function availabilityMessage(reason: string): string {
  switch (reason) {
    case 'publication_uncertain':
      return 'A previous attempt may still be in progress or may have published. Check the official account before retrying.';
    case 'private_report':
      return 'Private reports cannot be published publicly. Create a public report to use Bluesky.';
    case 'report_ineligible':
      return 'This report is flagged or inactive and is not eligible for public publication.';
    case 'report_incomplete':
      return 'This report needs a valid title and description before it can be published.';
    case 'report_unavailable':
      return 'This report could not be verified for your account.';
    default:
      return 'Report publication eligibility could not be verified. Check again later.';
  }
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 16,
    marginBottom: 20,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.borderDark,
  },
  heading: { ...Typography.h4, color: Colors.textMain, marginBottom: 6 },
  disclosure: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 12 },
  preview: {
    padding: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    marginBottom: 12,
  },
  accountIdentity: { marginBottom: 10 },
  accountName: { ...Typography.bodySm, color: Colors.textMain, fontWeight: '700' },
  accountHandle: { ...Typography.caption, color: Colors.textSecondary },
  photo: { width: '100%', height: 150, borderRadius: BorderRadius.sm, marginBottom: 8 },
  previewText: { ...Typography.bodySm, color: Colors.textMain },
  characterCount: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'right', marginTop: 8 },
  noPhoto: { ...Typography.caption, color: Colors.textSecondary, marginTop: 8 },
  statusText: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 10 },
  error: { ...Typography.caption, color: Colors.error, marginBottom: 10 },
  success: { ...Typography.caption, color: Colors.success, marginBottom: 10 },
  confirmation: {
    padding: 12,
    marginBottom: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primaryLight,
  },
  confirmationText: { ...Typography.bodySm, color: Colors.primaryDark, marginBottom: 10 },
  publishButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#0085FF',
  },
  disabledButton: { opacity: 0.55 },
  publishText: { ...Typography.button, color: '#fff' },
  cancelButton: { minHeight: 40, justifyContent: 'center' },
  cancelText: { ...Typography.button, color: Colors.textSecondary, textAlign: 'center' },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  linkText: { ...Typography.button, color: '#0066CC', textAlign: 'center' },
});
