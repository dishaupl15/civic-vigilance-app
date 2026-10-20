import { IssueCategory } from '../types';
import { findAuthorities } from './authorities';
import { MatchedAuthority } from './smartAuthorities';
import { encodeGeohash } from './geohash';

const DEPARTMENT_SUGGESTIONS: Record<IssueCategory, string[]> = {
  pothole: ['Municipal public works or roads department'],
  garbage: ['Municipal sanitation or solid-waste department'],
  streetlight: ['Municipal street-lighting or public works department'],
  drainage: ['Municipal drainage or storm-water department'],
  water_supply: ['Local water-supply utility or municipal water department'],
  sewage: ['Municipal sewerage or wastewater department'],
  traffic_signal: ['Local traffic engineering department or traffic police'],
  encroachment: ['Municipal enforcement or public-works department'],
  stray_animals: ['Municipal animal-control or veterinary department'],
  parks: ['Municipal parks or horticulture department'],
  other: ['Local municipal corporation or civic-services department'],
};

export interface AuthorityRecommendations {
  accounts: MatchedAuthority[];
  departments: string[];
  unverifiedDirectoryMatches: boolean;
}

const INDIAN_STATES = new Set([
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa',
  'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala',
  'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland',
  'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura',
  'uttar pradesh', 'uttarakhand', 'west bengal', 'delhi', 'jammu and kashmir',
  'ladakh', 'puducherry',
]);

function addressRegion(address: string) {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  const stateIndex = parts.findIndex((part) => INDIAN_STATES.has(part.toLocaleLowerCase()));
  return {
    city: stateIndex > 0 ? parts[stateIndex - 1] : undefined,
    state: stateIndex >= 0 ? parts[stateIndex] : undefined,
  };
}

function safeHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function verifiedXProfileUrl(value: string | undefined, handle: string): string | undefined {
  const safeUrl = safeHttpsUrl(value);
  if (!safeUrl) return undefined;
  const url = new URL(safeUrl);
  const host = url.hostname.toLocaleLowerCase();
  const path = url.pathname.split('/').filter(Boolean);
  if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host)
      || path.length !== 1
      || path[0].toLocaleLowerCase() !== handle.slice(1).toLocaleLowerCase()) {
    return undefined;
  }
  return url.toString();
}

export function emptyAuthorityRecommendations(category: IssueCategory): AuthorityRecommendations {
  return {
    accounts: [],
    departments: DEPARTMENT_SUGGESTIONS[category],
    unverifiedDirectoryMatches: false,
  };
}

export async function getAuthorityRecommendations(
  lat: number | undefined,
  lng: number | undefined,
  address: string,
  category: IssueCategory
): Promise<AuthorityRecommendations> {
  const location = addressRegion(address);
  if (lat === undefined && lng === undefined && !location.city) {
    return emptyAuthorityRecommendations(category);
  }

  const matches = await findAuthorities({ lat, lng, category, ...location });
  const accountByHandle = new Map<string, MatchedAuthority>();
  const geohash = lat !== undefined && lng !== undefined
    ? encodeGeohash(lat, lng, 8)
    : '';
  for (const authority of matches) {
    const twitter = authority.socialMedia?.twitter;
    const handle = twitter?.handle;
    if (authority.verificationStatus !== 'verified'
        || !handle
        || !/^@[A-Za-z0-9_]{1,15}$/.test(handle)
        || twitter?.verified !== true
        || twitter?.active === false) {
      continue;
    }
    const hasGeographicMatch = Boolean(geohash)
      && authority.jurisdiction.geohashes.some((prefix) => prefix.length > 0 && geohash.startsWith(prefix));
    accountByHandle.set(handle.toLocaleLowerCase(), {
      id: authority.id,
      handle,
      name: authority.name,
      confidence: hasGeographicMatch ? 1 : 0.8,
      matchReason: hasGeographicMatch
        ? `Verified directory match for ${category.replace(/_/g, ' ')} in this location`
        : `Verified directory match for ${category.replace(/_/g, ' ')} in ${location.city}`,
      sourceUrl: safeHttpsUrl(authority.sourceUrl),
      profileUrl: verifiedXProfileUrl(twitter.url, handle),
      lastVerifiedAt: authority.lastVerifiedAt?.toISOString(),
      verificationStatus: 'verified',
    });
  }

  return {
    accounts: [...accountByHandle.values()].slice(0, 5),
    departments: DEPARTMENT_SUGGESTIONS[category],
    unverifiedDirectoryMatches: matches.some((authority) => authority.verificationStatus !== 'verified'),
  };
}
