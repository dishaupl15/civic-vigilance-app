/**
 * Enhanced Sharing Module - Multi-platform social media sharing
 *
 * Supports direct sharing to:
 * - Twitter/X
 * - WhatsApp
 * - Instagram
 * - Facebook
 * - Native Share Sheet
 *
 * This is a USP feature for amplifying civic issues.
 */

import * as Sharing from 'expo-sharing';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert, Share } from 'react-native';

export interface ShareContent {
  text: string;
  imageUri?: string;
  url?: string;
  hashtags?: string[];
}

/**
 * Compose a civic issue post text
 */
export function composePostText(args: {
  title: string;
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  authorities?: string[];
  category?: string;
}): string {
  const parts: string[] = [];

  // Title and description
  parts.push(args.title);
  if (args.description) {
    parts.push(args.description);
  }

  // Location
  if (args.address) {
    parts.push(`\n📍 ${args.address}`);
  }

  // Google Maps link
  if (
    typeof args.lat === 'number'
    && Number.isFinite(args.lat)
    && args.lat >= -90
    && args.lat <= 90
    && typeof args.lng === 'number'
    && Number.isFinite(args.lng)
    && args.lng >= -180
    && args.lng <= 180
  ) {
    parts.push(`🗺️ https://maps.google.com/?q=${args.lat},${args.lng}`);
  }

  // Tag authorities
  if (args.authorities && args.authorities.length > 0) {
    parts.push(`\n${args.authorities.join(' ')}`);
  }

  // Hashtags
  const hashtags = ['#CivicVigilance'];
  if (args.category) {
    hashtags.push(`#${args.category.replace(/_/g, '')}`);
  }
  parts.push(`\n${hashtags.join(' ')}`);

  return parts.join('\n');
}

/**
 * Share to Twitter/X
 */
export async function shareToTwitter(content: ShareContent): Promise<boolean> {
  try {
    const text = encodeURIComponent(content.text);
    const url = content.url ? `&url=${encodeURIComponent(content.url)}` : '';
    const hashtags = content.hashtags ? `&hashtags=${content.hashtags.join(',')}` : '';

    const twitterUrl = `https://twitter.com/intent/tweet?text=${text}${url}${hashtags}`;

    const canOpen = await Linking.canOpenURL(twitterUrl);
    if (canOpen) {
      await Linking.openURL(twitterUrl);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Sharing] Twitter share failed:', error);
    return false;
  }
}

/**
 * Share to WhatsApp
 */
export async function shareToWhatsApp(content: ShareContent): Promise<boolean> {
  try {
    const text = encodeURIComponent(content.text);
    const whatsappUrl = `whatsapp://send?text=${text}`;

    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
      return true;
    } else {
      // Fallback to web WhatsApp
      const webUrl = `https://wa.me/?text=${text}`;
      await Linking.openURL(webUrl);
      return true;
    }
  } catch (error) {
    console.error('[Sharing] WhatsApp share failed:', error);
    return false;
  }
}

/**
 * Share to Instagram (via native share sheet with image)
 */
export async function shareToInstagram(imageUri: string): Promise<boolean> {
  try {
    // Instagram only accepts images through share sheet
    if (!await Sharing.isAvailableAsync()) {
      Alert.alert('Sharing Not Available', 'Native sharing is not supported on this device.');
      return false;
    }

    // Copy to cache for sharing
    const filename = imageUri.split('/').pop() || 'civic_issue.jpg';
    const cacheDir = (FileSystem as any).cacheDirectory;

    if (!cacheDir) {
      throw new Error('Cache directory not available');
    }

    const destPath = `${cacheDir}${filename}`;

    await FileSystem.copyAsync({
      from: imageUri,
      to: destPath,
    });

    await Sharing.shareAsync(destPath, {
      mimeType: 'image/jpeg',
      dialogTitle: 'Share to Instagram',
    });

    return true;
  } catch (error) {
    console.error('[Sharing] Instagram share failed:', error);
    return false;
  }
}

/**
 * Share to Facebook
 */
export async function shareToFacebook(content: ShareContent): Promise<boolean> {
  try {
    const url = content.url || '';
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

    const canOpen = await Linking.canOpenURL(fbUrl);
    if (canOpen) {
      await Linking.openURL(fbUrl);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Sharing] Facebook share failed:', error);
    return false;
  }
}

/**
 * Share via native share sheet (supports all platforms)
 */
export async function shareViaSheet(content: ShareContent): Promise<boolean> {
  try {
    if (!await Sharing.isAvailableAsync()) {
      Alert.alert('Sharing Not Available', 'Native sharing is not supported on this device.');
      return false;
    }

    if (content.imageUri) {
      // Share image with text
      await Sharing.shareAsync(content.imageUri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share Civic Issue',
        UTI: 'public.jpeg',
      });
    } else {
      const result = await Share.share({
        title: 'Share Civic Vigilance report',
        message: content.text,
      });
      return result.action === Share.sharedAction;
    }

    return true;
  } catch (error) {
    console.error('[Sharing] Native share failed:', error);
    return false;
  }
}

/**
 * Show sharing options dialog
 */
export function showShareDialog(
  content: ShareContent,
  onSuccess?: (platform: string) => void,
  onBluesky?: () => void
): void {
  Alert.alert(
    'Share Issue',
    'Choose where to share this civic issue',
    [
      {
        text: '🐦 Twitter',
        onPress: async () => {
          const success = await shareToTwitter(content);
          if (success && onSuccess) onSuccess('Twitter');
        },
      },
      {
        text: '💬 WhatsApp',
        onPress: async () => {
          const success = await shareToWhatsApp(content);
          if (success && onSuccess) onSuccess('WhatsApp');
        },
      },
      {
        text: '📸 Instagram',
        onPress: async () => {
          if (content.imageUri) {
            const success = await shareToInstagram(content.imageUri);
            if (success && onSuccess) onSuccess('Instagram');
          } else {
            Alert.alert('No Image', 'Instagram sharing requires an image.');
          }
        },
      },
      {
        text: '📘 Facebook',
        onPress: async () => {
          const success = await shareToFacebook(content);
          if (success && onSuccess) onSuccess('Facebook');
        },
      },
      {
        text: '📤 More Options',
        onPress: async () => {
          const success = await shareViaSheet(content);
          if (success && onSuccess) onSuccess('Native');
        },
      },
      ...(onBluesky ? [{
        text: '🦋 Bluesky',
        onPress: onBluesky,
      }] : []),
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ],
    { cancelable: true }
  );
}

/**
 * Quick share to specific platform
 */
export async function quickShare(
  platform: 'twitter' | 'whatsapp' | 'instagram' | 'facebook' | 'native',
  content: ShareContent
): Promise<boolean> {
  switch (platform) {
    case 'twitter':
      return shareToTwitter(content);
    case 'whatsapp':
      return shareToWhatsApp(content);
    case 'instagram':
      return content.imageUri ? shareToInstagram(content.imageUri) : false;
    case 'facebook':
      return shareToFacebook(content);
    case 'native':
      return shareViaSheet(content);
    default:
      return false;
  }
}

/**
 * Share with analytics tracking
 */
export async function shareWithTracking(
  platform: string,
  content: ShareContent,
  issueId?: string
): Promise<void> {
  console.log(`[Sharing] Sharing issue ${issueId} to ${platform}`);

  const success = await quickShare(platform as any, content);

  if (success) {
    console.log(`[Sharing] Successfully shared to ${platform}`);
    // TODO: Track share event in analytics
    // analytics.track('issue_shared', { platform, issueId });
  } else {
    console.log(`[Sharing] Failed to share to ${platform}`);
  }
}
