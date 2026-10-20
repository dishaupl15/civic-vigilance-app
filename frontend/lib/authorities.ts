/**
 * Authority Database and Mapping System
 * As per PDF section 2.9 - Authority Database & Mapping System
 *
 * This module handles intelligent matching of GPS coordinates to relevant
 * government authority Twitter handles for tagging in reports.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { Authority, AuthorityJurisdictionType, IssueCategory, SocialPlatformHandle } from '../types';
import { encodeGeohash } from './geohash';
import { isIssueCategory } from './issueMapper';

type Row = Record<string, unknown>;

function asRow(value: unknown): Row | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Row
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requiredString(row: Row, key: string): string {
  const value = asString(row[key]);
  if (!value) throw new Error(`The authority response is missing ${key}.`);
  return value;
}

function isJurisdictionType(value: unknown): value is AuthorityJurisdictionType {
  return value === 'national' || value === 'state' || value === 'city' ||
    value === 'ward' || value === 'department';
}

function parseAuthority(value: unknown): Authority {
  const row = asRow(value);
  if (!row) throw new Error('The authority response is not a valid database row.');
  const jurisdictionType = row.jurisdiction_type;
  const status = row.status;
  if (!isJurisdictionType(jurisdictionType)) {
    throw new Error('The authority response has an unsupported jurisdiction type.');
  }
  if (status !== 'active' && status !== 'inactive') {
    throw new Error('The authority response has an unsupported status.');
  }
  const social = asRow(row.social_media);
  const twitter = asRow(social?.twitter);
  const whatsapp = asRow(social?.whatsapp);
  const instagram = asRow(social?.instagram);
  const facebook = asRow(social?.facebook);
  const telegram = asRow(social?.telegram);
  const telegramActive = typeof telegram?.active === 'boolean' ? telegram.active : undefined;
  const contact = asRow(row.contact_info);
  const response = asRow(row.response_metrics);
  const geohashes = Array.isArray(row.geohashes)
    ? row.geohashes.filter((item): item is string => typeof item === 'string')
    : [];
  const issueCategories = Array.isArray(row.issue_categories)
    ? row.issue_categories.filter(isIssueCategory)
    : [];
  const createdAt = requiredString(row, 'created_at');
  const updatedAt = asString(row.updated_at);
  const verificationStatus = row.verification_status;
  const lastVerifiedAt = asString(row.last_verified_at);
  if (typeof row.jurisdiction_level !== 'number' || typeof row.priority !== 'number') {
    throw new Error('The authority response is missing jurisdiction priority data.');
  }

  const mapPlatform = (platform: Row | undefined): SocialPlatformHandle | undefined => {
    if (!platform) return undefined;
    return {
      handle: asString(platform.handle),
      verified: typeof platform.verified === 'boolean' ? platform.verified : undefined,
      active: typeof platform.active === 'boolean' ? platform.active : undefined,
      lastChecked: asString(platform.last_checked) ? new Date(String(platform.last_checked)) : undefined,
      url: asString(platform.url),
    };
  };
  const socialMedia = social ? {
    twitter: mapPlatform(twitter),
    instagram: mapPlatform(instagram),
    facebook: mapPlatform(facebook),
    whatsapp: whatsapp ? {
      number: asString(whatsapp.number),
      businessVerified: typeof whatsapp.businessVerified === 'boolean' ? whatsapp.businessVerified : undefined,
      active: typeof whatsapp.active === 'boolean' ? whatsapp.active : undefined,
      lastChecked: asString(whatsapp.last_checked) ? new Date(String(whatsapp.last_checked)) : undefined,
    } : undefined,
    telegram: telegram && telegramActive !== undefined ? {
      handle: asString(telegram.handle),
      chatId: asString(telegram.chatId),
      active: telegramActive,
    } : undefined,
  } : undefined;

  return {
    id: requiredString(row, 'id'),
    name: requiredString(row, 'name'),
    nameLocal: asString(row.name_local),
    verificationStatus: verificationStatus === 'verified' || verificationStatus === 'seed'
      || verificationStatus === 'expired' || verificationStatus === 'rejected'
      ? verificationStatus
      : undefined,
    sourceUrl: asString(row.source_url),
    lastVerifiedAt: lastVerifiedAt ? new Date(lastVerifiedAt) : undefined,
    twitter: asString(twitter?.handle),
    socialMedia,
    jurisdiction: {
      type: jurisdictionType,
      level: row.jurisdiction_level,
      country: requiredString(row, 'country'),
      state: asString(row.state),
      city: asString(row.city),
      ward: typeof row.ward === 'number' ? row.ward : undefined,
      zone: asString(row.zone),
      geohashes,
    },
    issueCategories,
    priority: row.priority,
    contactInfo: contact ? {
      email: asString(contact.email),
      phone: asString(contact.phone),
      tollFree: asString(contact.tollFree),
      website: asString(contact.website),
      mobileApp: asString(contact.mobileApp),
    } : undefined,
    responseMetrics: response ? {
      averageResponseTime: typeof response.averageResponseTime === 'number' ? response.averageResponseTime : undefined,
      totalIssuesAddressed: typeof response.totalIssuesAddressed === 'number' ? response.totalIssuesAddressed : undefined,
      lastActive: asString(response.lastActive) ? new Date(String(response.lastActive)) : undefined,
    } : undefined,
    status,
    verifiedBy: asString(row.verified_by),
    createdAt: new Date(createdAt),
    updatedAt: updatedAt ? new Date(updatedAt) : new Date(createdAt),
  };
}

/**
 * Category to department mapping (from PDF)
 */
const CATEGORY_DEPARTMENT_MAP: Record<IssueCategory, string[]> = {
  pothole: ['Roads', 'Public Works', 'Traffic Police'],
  garbage: ['Sanitation', 'Waste Management'],
  streetlight: ['Electrical', 'Public Works'],
  drainage: ['Sewerage Board', 'Public Works'],
  water_supply: ['Water Board', 'Public Works'],
  sewage: ['Sewerage Board', 'Public Works'],
  traffic_signal: ['Traffic Police', 'Public Works'],
  encroachment: ['Town Planning', 'Municipal Corporation'],
  stray_animals: ['Animal Welfare', 'Health Department'],
  parks: ['Horticulture', 'Parks Department'],
  other: ['Municipal Corporation'],
};

/**
 * Sample authority data for demonstration
 * Used as fallback when Supabase is not configured
 */
const SAMPLE_AUTHORITIES: Partial<Authority>[] = [
  {
    id: 'bbmp_ward_23',
    name: 'BBMP Ward 23 Office',
    nameLocal: 'ಬಿಬಿಎಂಪಿ ವಾರ್ಡ್ 23',
    twitter: '@BBMP_Ward23',
    jurisdiction: {
      type: 'ward',
      level: 4,
      country: 'India',
      state: 'Karnataka',
      city: 'Bangalore',
      ward: 23,
      zone: 'East Zone',
      geohashes: ['tdnu20', 'tdnu21'],
    },
    issueCategories: ['pothole', 'garbage', 'streetlight', 'drainage', 'water_supply'],
    priority: 1,
  },
  {
    id: 'bbmp_comm',
    name: 'BBMP Official Account',
    twitter: '@BBMPCOMM',
    jurisdiction: {
      type: 'city',
      level: 3,
      country: 'India',
      state: 'Karnataka',
      city: 'Bangalore',
      geohashes: ['tdnu'],
    },
    issueCategories: ['pothole', 'garbage', 'streetlight', 'drainage', 'water_supply', 'sewage'],
    priority: 2,
  },
  {
    id: 'blr_city_police',
    name: 'Bangalore Traffic Police',
    twitter: '@BlrCityPolice',
    jurisdiction: {
      type: 'department',
      level: 3,
      country: 'India',
      state: 'Karnataka',
      city: 'Bangalore',
      geohashes: ['tdnu'],
    },
    issueCategories: ['pothole', 'traffic_signal', 'encroachment'],
    priority: 3,
  },
];

/**
 * Find relevant authorities for a report based on GPS coordinates and category
 * Implements the algorithm from PDF section 2.9.2
 */
export async function findAuthorities(params: {
  lat?: number;
  lng?: number;
  category: IssueCategory;
  city?: string;
  state?: string;
}): Promise<Authority[]> {
  const { lat, lng, category, city, state } = params;
  if (!isSupabaseConfigured) throw new Error('Authority lookup is unavailable because Supabase is not configured.');

  if ((lat === undefined) !== (lng === undefined)) {
    throw new Error('Both location coordinates are required for authority matching.');
  }
  const hasCoordinates = lat !== undefined && lng !== undefined;
  if (hasCoordinates && (!Number.isFinite(lat) || !Number.isFinite(lng)
      || lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
    throw new Error('The report coordinates are invalid for authority matching.');
  }
  const geohash = hasCoordinates ? encodeGeohash(lat, lng, 8) : '';
  const { data, error } = await supabase
    .from('authorities')
    .select('id,name,name_local,social_media,jurisdiction_type,jurisdiction_level,country,state,city,ward,zone,geohashes,issue_categories,priority,contact_info,response_metrics,status,verified_by,verification_status,source_url,last_verified_at,created_at,updated_at')
    .eq('status', 'active')
    .contains('issue_categories', [category]);
  if (error) throw new Error(`Could not load matching authorities (${error.code || 'unknown'}: ${error.message || 'database request failed'}).`);

  const candidates: Authority[] = (data ?? []).map((row: unknown) => parseAuthority(row));
  const matching = candidates.filter((authority) => {
    const geographicMatch = hasCoordinates && authority.jurisdiction.geohashes.some(
      (prefix) => prefix.length > 0 && geohash.startsWith(prefix),
    );
    const cityMatch = Boolean(city) &&
      authority.jurisdiction.type === 'city' &&
      authority.jurisdiction.city?.toLocaleLowerCase() === city?.toLocaleLowerCase() &&
      (!state || authority.jurisdiction.state?.toLocaleLowerCase() === state.toLocaleLowerCase());
    return geographicMatch || cityMatch;
  });

  const unique = new Map(matching.map((authority) => [authority.id, authority]));
  return [...unique.values()]
    .sort((left, right) => left.priority - right.priority);
}

/**
 * Legacy function for backward compatibility
 */
export function suggestAuthorities(region?: string): string[] {
  // Return sample handles
  return ['@BBMP_Ward23', '@BBMPCOMM', '@BlrCityPolice'];
}

/**
 * Get authority performance metrics
 */
export async function getAuthorityMetrics(authorityId: string): Promise<Authority['metrics'] | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('authorities')
    .select('response_metrics')
    .eq('id', authorityId)
    .maybeSingle();
  if (error) throw new Error('Could not load authority metrics.');
  const metrics = asRow(data?.response_metrics);
  if (!metrics) return null;
  return {
    averageResponseTime: typeof metrics.averageResponseTime === 'number' ? metrics.averageResponseTime : undefined,
    totalIssuesAddressed: typeof metrics.totalIssuesAddressed === 'number' ? metrics.totalIssuesAddressed : undefined,
  };
}

/**
 * Verify if a Twitter handle is active
 * (Would be implemented in Supabase Edge Functions with actual Twitter API calls)
 */
export async function verifyTwitterHandle(handle: string): Promise<boolean> {
  // This should be a Supabase Edge Function call
  try {
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || '';
    const response = await fetch(`${apiUrl}/verifyTwitterHandle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    return data.active || false;
  } catch (error) {
    console.error('Error verifying Twitter handle:', error);
    return false;
  }
}

/**
 * Update authority response status when they interact on Twitter
 * (Called from Supabase Edge Functions monitoring Twitter)
 */
export async function recordAuthorityResponse(params: {
  reportId: string;
  authorityId: string;
  responseType: 'reply' | 'like' | 'retweet';
}): Promise<void> {
  // This would update the report in Supabase
  // Implementation depends on Supabase Edge Functions
  console.log('Authority response recorded:', params);
}
