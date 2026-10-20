/**
 * Authority Contact Manager
 *
 * Manages multi-platform communication with authorities.
 * Supports: Twitter, WhatsApp, Instagram, Facebook, Telegram, Email, Phone
 *
 * PRD Enhancement: Beyond just Twitter tagging, this enables users to reach
 * authorities through their preferred/most responsive channels.
 */

import { Authority, SocialPlatformHandle } from '../types';
import { Linking, Platform } from 'react-native';

export interface ContactOption {
  platform: 'twitter' | 'whatsapp' | 'instagram' | 'facebook' | 'telegram' | 'email' | 'phone' | 'website';
  label: string;
  value: string;
  icon: string; // Ionicons name
  verified: boolean;
  active: boolean;
  action: () => void;
}

/**
 * Get all available contact options for an authority
 */
export function getAuthorityContactOptions(authority: Authority): ContactOption[] {
  const options: ContactOption[] = [];

  // Twitter
  if (authority.socialMedia?.twitter?.active && authority.socialMedia.twitter.handle) {
    const twitter = authority.socialMedia.twitter;
    options.push({
      platform: 'twitter',
      label: `Twitter: ${twitter.handle || 'N/A'}`,
      value: twitter.handle || '',
      icon: 'logo-twitter',
      verified: twitter.verified === true,
      active: true,
      action: () => openTwitterProfile(twitter),
    });
  }

  // WhatsApp
  const whatsappNumber = authority.socialMedia?.whatsapp?.number;
  if (authority.socialMedia?.whatsapp?.active && whatsappNumber) {
    const whatsapp = authority.socialMedia.whatsapp;
    options.push({
      platform: 'whatsapp',
      label: `WhatsApp: ${formatPhoneNumber(whatsappNumber)}`,
      value: whatsappNumber,
      icon: 'logo-whatsapp',
      verified: whatsapp.businessVerified === true,
      active: true,
      action: () => openWhatsApp(whatsappNumber),
    });
  }

  // Instagram
  if (authority.socialMedia?.instagram?.active && authority.socialMedia.instagram.handle) {
    const instagram = authority.socialMedia.instagram;
    options.push({
      platform: 'instagram',
      label: `Instagram: ${instagram.handle || 'N/A'}`,
      value: instagram.handle || '',
      icon: 'logo-instagram',
      verified: instagram.verified === true,
      active: true,
      action: () => openInstagramProfile(instagram),
    });
  }

  // Facebook
  if (authority.socialMedia?.facebook?.active && authority.socialMedia.facebook.handle) {
    const facebook = authority.socialMedia.facebook;
    options.push({
      platform: 'facebook',
      label: `Facebook: ${facebook.handle || 'N/A'}`,
      value: facebook.handle || '',
      icon: 'logo-facebook',
      verified: facebook.verified === true,
      active: true,
      action: () => openFacebookProfile(facebook),
    });
  }

  // Telegram
  if (authority.socialMedia?.telegram?.active &&
      (authority.socialMedia.telegram.handle || authority.socialMedia.telegram.chatId)) {
    const telegram = authority.socialMedia.telegram;
    options.push({
      platform: 'telegram',
      label: `Telegram: ${telegram.handle || 'Chat'}`,
      value: telegram.handle || telegram.chatId || '',
      icon: 'paper-plane',
      verified: false,
      active: true,
      action: () => openTelegram(telegram.handle, telegram.chatId),
    });
  }

  // Email
  if (authority.contactInfo?.email) {
    options.push({
      platform: 'email',
      label: `Email: ${authority.contactInfo.email}`,
      value: authority.contactInfo.email,
      icon: 'mail',
      verified: false,
      active: true,
      action: () => sendEmail(authority.contactInfo!.email!),
    });
  }

  // Phone (Customer Service)
  if (authority.contactInfo?.phone) {
    options.push({
      platform: 'phone',
      label: `Call: ${authority.contactInfo.phone}`,
      value: authority.contactInfo.phone,
      icon: 'call',
      verified: false,
      active: true,
      action: () => makeCall(authority.contactInfo!.phone!),
    });
  }

  // Toll-Free Helpline
  if (authority.contactInfo?.tollFree) {
    options.push({
      platform: 'phone',
      label: `Toll-Free: ${authority.contactInfo.tollFree}`,
      value: authority.contactInfo.tollFree,
      icon: 'call-outline',
      verified: false,
      active: true,
      action: () => makeCall(authority.contactInfo!.tollFree!),
    });
  }

  // Website
  if (authority.contactInfo?.website) {
    options.push({
      platform: 'website',
      label: 'Visit Website',
      value: authority.contactInfo.website,
      icon: 'globe',
      verified: false,
      active: true,
      action: () => openWebsite(authority.contactInfo!.website!),
    });
  }

  return options;
}

/**
 * Get Twitter handles for tagging (used in Stage 4 Preview)
 */
export function getTwitterHandles(authorities: Authority[]): string[] {
  return authorities
    .filter(auth => auth.socialMedia?.twitter?.active)
    .map(auth => auth.socialMedia?.twitter?.handle || '')
    .filter(handle => handle !== '');
}

/**
 * Get WhatsApp numbers for direct messaging
 */
export function getWhatsAppNumbers(authorities: Authority[]): string[] {
  return authorities
    .filter(auth => auth.socialMedia?.whatsapp?.active)
    .map(auth => auth.socialMedia?.whatsapp?.number || '')
    .filter(num => num !== '');
}

/**
 * Format phone number for display
 */
function formatPhoneNumber(phone: string): string {
  // Format +91XXXXXXXXXX to +91 XXXXX-XXXXX
  if (phone.startsWith('+91') && phone.length === 13) {
    return `${phone.slice(0, 3)} ${phone.slice(3, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

/**
 * Open Twitter profile
 */
function openTwitterProfile(twitter: SocialPlatformHandle) {
  const handle = twitter.handle?.replace('@', '') || '';
  const url = twitter.url || `https://twitter.com/${handle}`;

  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      console.error('[Contact] Cannot open Twitter URL:', url);
    }
  });
}

/**
 * Open WhatsApp chat
 */
function openWhatsApp(phoneNumber: string) {
  // Format: whatsapp://send?phone=91XXXXXXXXXX
  const cleanNumber = phoneNumber.replace(/\D/g, ''); // Remove non-digits
  const url = Platform.OS === 'ios'
    ? `whatsapp://send?phone=${cleanNumber}`
    : `whatsapp://send?phone=${cleanNumber}`;

  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      // Fallback to web WhatsApp
      Linking.openURL(`https://wa.me/${cleanNumber}`);
    }
  });
}

/**
 * Open Instagram profile
 */
function openInstagramProfile(instagram: SocialPlatformHandle) {
  const handle = instagram.handle?.replace('@', '') || '';
  const url = instagram.url || `https://instagram.com/${handle}`;

  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      console.error('[Contact] Cannot open Instagram URL:', url);
    }
  });
}

/**
 * Open Facebook profile
 */
function openFacebookProfile(facebook: SocialPlatformHandle) {
  const url = facebook.url || `https://facebook.com/${facebook.handle}`;

  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      console.error('[Contact] Cannot open Facebook URL:', url);
    }
  });
}

/**
 * Open Telegram chat
 */
function openTelegram(handle?: string, chatId?: string) {
  let url = '';

  if (handle) {
    url = `https://t.me/${handle.replace('@', '')}`;
  } else if (chatId) {
    url = `tg://resolve?domain=${chatId}`;
  }

  if (url) {
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        console.error('[Contact] Cannot open Telegram URL:', url);
      }
    });
  }
}

/**
 * Send email
 */
function sendEmail(email: string, subject?: string, body?: string) {
  let url = `mailto:${email}`;
  const params = [];

  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);

  if (params.length > 0) {
    url += `?${params.join('&')}`;
  }

  Linking.openURL(url).catch(err => {
    console.error('[Contact] Cannot open email:', err);
  });
}

/**
 * Make phone call
 */
function makeCall(phoneNumber: string) {
  const url = `tel:${phoneNumber}`;

  Linking.canOpenURL(url).then(supported => {
    if (supported) {
      Linking.openURL(url);
    } else {
      console.error('[Contact] Cannot make call:', phoneNumber);
    }
  });
}

/**
 * Open website
 */
function openWebsite(url: string) {
  // Ensure URL has protocol
  const formattedUrl = url.startsWith('http') ? url : `https://${url}`;

  Linking.canOpenURL(formattedUrl).then(supported => {
    if (supported) {
      Linking.openURL(formattedUrl);
    } else {
      console.error('[Contact] Cannot open website:', formattedUrl);
    }
  });
}

/**
 * Generate shareable message for multiple platforms
 */
export function generateIssueMessage(
  title: string,
  description: string,
  address: string,
  category: string,
  authorities: Authority[]
): {
  twitter: string;
  whatsapp: string;
  email: string;
} {
  // Twitter message (280 char limit)
  const twitterHandles = getTwitterHandles(authorities).join(' ');
  const twitterMessage = `🚨 ${title}\n\n📍 ${address}\n\n${description.slice(0, 140)}...\n\n${twitterHandles} #CivicVigilance`;

  // WhatsApp message (longer format)
  const whatsappMessage = `🚨 *${title}*\n\n📍 *Location:* ${address}\n\n📝 *Details:* ${description}\n\n🏷️ *Category:* ${category}\n\n⚠️ *Authorities notified:* ${authorities.map(a => a.name).join(', ')}\n\n_Reported via CivicVigilance_`;

  // Email message (formal format)
  const emailMessage = `Dear Sir/Madam,\n\nI would like to report the following civic issue:\n\n**Issue:** ${title}\n**Location:** ${address}\n**Category:** ${category}\n\n**Description:**\n${description}\n\nThis issue requires your immediate attention as it affects the local community.\n\nThank you for your prompt action.\n\nSincerely,\nA Concerned Citizen\n\n(Reported via CivicVigilance App)`;

  return {
    twitter: twitterMessage,
    whatsapp: whatsappMessage,
    email: emailMessage,
  };
}

/**
 * Get best contact method for an authority based on responsiveness
 */
export function getBestContactMethod(authority: Authority): ContactOption | null {
  const options = getAuthorityContactOptions(authority);

  if (options.length === 0) return null;

  // Priority order: Twitter (verified) > WhatsApp (business) > Instagram > Facebook > Email > Phone
  const priorityOrder = ['twitter', 'whatsapp', 'instagram', 'facebook', 'email', 'phone'];

  for (const platform of priorityOrder) {
    const option = options.find(opt => opt.platform === platform && opt.active);
    if (option) {
      // Prefer verified accounts
      if (option.verified) return option;
    }
  }

  // Return first active option
  return options.find(opt => opt.active) || options[0];
}
