import { IssueCategory } from '../types';
import { getMatchedAuthoritiesWithDetails, MatchedAuthority } from './smartAuthorities';

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

export function getAuthorityRecommendations(
  lat: number | undefined,
  lng: number | undefined,
  address: string,
  category: IssueCategory
): AuthorityRecommendations {
  const matches = getMatchedAuthoritiesWithDetails(lat, lng, address, category);
  const accounts = matches.filter((authority) => authority.verificationStatus === 'verified');
  return {
    accounts,
    departments: DEPARTMENT_SUGGESTIONS[category],
    unverifiedDirectoryMatches: matches.length > accounts.length,
  };
}
