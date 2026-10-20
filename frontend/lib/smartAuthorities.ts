/**
 * Smart Authority Matching Algorithm
 * PRD Section 7.3 - Authority Matching Algorithm
 *
 * Logic Flow:
 * 1. Parse address to extract city, state, PIN code
 * 2. Convert GPS to a precise geohash and match jurisdiction prefixes
 * 4. Fallback hierarchy: exact → city → state → national
 * 5. Filter by category compatibility
 * 6. Sort by priority (1=primary, 2=secondary, 3=fallback)
 * 7. Return top 3-5 handles
 */

import { encodeGeohash } from './geohash';
import { AUTHORITIES_SEED_DATA } from './authoritiesData';
import { IssueCategory } from '../types';

export interface MatchedAuthority {
  id?: string;
  handle: string;
  name: string;
  confidence: number; // 0-1 based on match quality
  matchReason: string; // For debugging
  sourceUrl?: string;
  profileUrl?: string;
  lastVerifiedAt?: string;
  verificationStatus: 'verified' | 'seed' | 'expired';
}

/**
 * Parse Indian address to extract components
 * Format: "Casa Rio Gold Road, Kalyan, Maharashtra, 421204, India"
 */
function parseAddress(address: string): {
  city: string | null;
  state: string | null;
} {
  const parts = address.split(',').map((p) => p.trim());

  // Common Indian states
  const indianStates = [
    'maharashtra',
    'karnataka',
    'delhi',
    'tamil nadu',
    'telangana',
    'andhra pradesh',
    'gujarat',
    'rajasthan',
    'west bengal',
    'madhya pradesh',
    'uttar pradesh',
    'kerala',
    'punjab',
    'haryana',
  ];

  const state =
    parts.find((p) => indianStates.includes(p.toLowerCase())) || null;

  // City is typically before state
  const stateIndex = state ? parts.findIndex((p) => p.toLowerCase() === state.toLowerCase()) : -1;
  const city = stateIndex > 0 ? parts[stateIndex - 1] : null;

  return { city, state };
}

/**
 * Find authorities based on GPS coordinates, address, and issue category
 *
 * @param lat - Latitude
 * @param lng - Longitude
 * @param address - Full address string
 * @param category - Issue category
 * @returns Array of matched authority handles with confidence scores
 */
export function findAuthorities(
  lat: number | undefined,
  lng: number | undefined,
  address: string,
  category: IssueCategory
): MatchedAuthority[] {
  const matches: MatchedAuthority[] = [];

  // Step 1: Parse address
  const { city, state } = parseAddress(address);

  const hasCoordinates = typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  const geohash = hasCoordinates ? encodeGeohash(lat, lng, 8) : '';

  // Step 3: Match authorities by geohash
  const geohashMatches = hasCoordinates ? AUTHORITIES_SEED_DATA.filter((auth) => {
    return auth.jurisdiction.geohashes.some((authGeohash) =>
      authGeohash.length > 0 &&
      (geohash.startsWith(authGeohash) || authGeohash.startsWith(geohash))
    );
  }) : [];

  // Add geohash matches
  geohashMatches.forEach((auth) => {
    const handle = auth.socialMedia?.twitter?.handle || auth.twitter;
    if (auth.issueCategories.includes(category) && handle) {
      matches.push({
        handle,
        name: auth.name,
        confidence: auth.priority === 1 ? 0.9 : 0.7,
        matchReason: 'Geohash + Category match',
        sourceUrl: auth.contactInfo?.website,
        verificationStatus: 'seed',
      });
    }
  });

  // Step 4: Fallback - Match by city
  if (city && matches.length < 3) {
    const cityMatches = AUTHORITIES_SEED_DATA.filter(
      (auth) =>
        auth.jurisdiction.city?.toLowerCase() === city.toLowerCase() &&
        (!state || auth.jurisdiction.state?.toLowerCase() === state.toLowerCase()) &&
        auth.issueCategories.includes(category)
    );

    cityMatches.forEach((auth) => {
      // Avoid duplicates and check Twitter is active
      const handle = auth.socialMedia?.twitter?.handle || auth.twitter;
      if (handle && !matches.find((m) => m.handle === handle)) {
        matches.push({
          handle,
          name: auth.name,
          confidence: auth.priority === 1 ? 0.8 : 0.6,
          matchReason: 'City + Category match',
          sourceUrl: auth.contactInfo?.website,
          verificationStatus: 'seed',
        });
      }
    });
  }

  // Step 5: Fallback - Match by state
  if (state && matches.length < 3) {
    const stateMatches = AUTHORITIES_SEED_DATA.filter(
      (auth) =>
        auth.jurisdiction.state?.toLowerCase() === state.toLowerCase() &&
        auth.issueCategories.includes(category)
    );

    stateMatches.forEach((auth) => {
      const handle = auth.socialMedia?.twitter?.handle || auth.twitter;
      if (handle && !matches.find((m) => m.handle === handle)) {
        matches.push({
          handle,
          name: auth.name,
          confidence: auth.priority === 1 ? 0.6 : 0.4,
          matchReason: 'State + Category match',
          sourceUrl: auth.contactInfo?.website,
          verificationStatus: 'seed',
        });
      }
    });
  }

  // Step 6: Fallback - National level (generic)
  if (matches.length < 2) {
    const nationalMatches = AUTHORITIES_SEED_DATA.filter(
      (auth) =>
        auth.jurisdiction.type === 'national' &&
        auth.issueCategories.includes(category)
    );

    nationalMatches.forEach((auth) => {
      const handle = auth.socialMedia?.twitter?.handle || auth.twitter;
      if (handle && !matches.find((m) => m.handle === handle)) {
        matches.push({
          handle,
          name: auth.name,
          confidence: 0.3,
          matchReason: 'National fallback',
          sourceUrl: auth.contactInfo?.website,
          verificationStatus: 'seed',
        });
      }
    });
  }

  // Step 7: Sort by confidence and return top 5
  const sorted = matches
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return sorted;
}

/**
 * Get authority handles only (for tweet composition)
 */
export function getAuthorityHandles(
  lat: number | undefined,
  lng: number | undefined,
  address: string,
  category: IssueCategory
): string[] {
  const authorities = findAuthorities(lat, lng, address, category);
  return authorities.map((auth) => auth.handle);
}

/**
 * Get matched authorities with details
 */
export function getMatchedAuthoritiesWithDetails(
  lat: number | undefined,
  lng: number | undefined,
  address: string,
  category: IssueCategory
): MatchedAuthority[] {
  return findAuthorities(lat, lng, address, category);
}

/**
 * Validate if a Twitter handle exists in our database
 */
export function validateAuthorityHandle(handle: string): boolean {
  const normalizedHandle = handle.startsWith('@') ? handle : `@${handle}`;
  return AUTHORITIES_SEED_DATA.some(
    (auth) => auth.socialMedia?.twitter?.handle?.toLowerCase() === normalizedHandle.toLowerCase()
  );
}

/**
 * Get authority info by handle
 */
export function getAuthorityByHandle(handle: string) {
  const normalizedHandle = handle.startsWith('@') ? handle : `@${handle}`;
  return AUTHORITIES_SEED_DATA.find(
    (auth) => auth.socialMedia?.twitter?.handle?.toLowerCase() === normalizedHandle.toLowerCase()
  );
}
