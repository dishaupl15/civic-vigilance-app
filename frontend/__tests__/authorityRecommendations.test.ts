import { getAuthorityRecommendations } from '../lib/authorityRecommendations';
import { getMatchedAuthoritiesWithDetails } from '../lib/smartAuthorities';

jest.mock('../lib/smartAuthorities', () => ({
  getMatchedAuthoritiesWithDetails: jest.fn(),
}));

describe('authority recommendations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('withholds unverified directory entries and provides department-level ideas', () => {
    jest.mocked(getMatchedAuthoritiesWithDetails).mockReturnValue([{
      name: 'Example Municipal Department',
      handle: '@ExampleCivic',
      confidence: 0.8,
      matchReason: 'City + Category match',
      sourceUrl: 'https://example.gov',
      verificationStatus: 'seed',
    }]);

    const recommendations = getAuthorityRecommendations(19, 72, 'Mumbai, Maharashtra', 'pothole');
    expect(getMatchedAuthoritiesWithDetails).toHaveBeenCalledWith(19, 72, 'Mumbai, Maharashtra', 'pothole');
    expect(recommendations.accounts).toEqual([]);
    expect(recommendations.unverifiedDirectoryMatches).toBe(true);
    expect(recommendations.departments).toEqual(['Municipal public works or roads department']);
  });

  it('returns a verified account match without changing its provenance', () => {
    jest.mocked(getMatchedAuthoritiesWithDetails).mockReturnValue([{
      name: 'Verified Municipal Department',
      handle: '@VerifiedCivic',
      confidence: 0.8,
      matchReason: 'City + Category match',
      sourceUrl: 'https://example.gov',
      verificationStatus: 'verified',
    }]);

    const recommendations = getAuthorityRecommendations(19, 72, 'Mumbai, Maharashtra', 'pothole');
    expect(recommendations.accounts.map((authority) => authority.handle)).toEqual(['@VerifiedCivic']);
    expect(recommendations.unverifiedDirectoryMatches).toBe(false);
  });

  it('provides safe department-level guidance without inventing an account', () => {
    jest.mocked(getMatchedAuthoritiesWithDetails).mockReturnValue([]);
    const recommendations = getAuthorityRecommendations(undefined, undefined, 'Unknown location', 'water_supply');
    expect(recommendations.accounts).toEqual([]);
    expect(recommendations.unverifiedDirectoryMatches).toBe(false);
    expect(recommendations.departments).toEqual(['Local water-supply utility or municipal water department']);
  });
});
