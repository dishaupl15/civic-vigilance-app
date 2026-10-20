import { getAuthorityRecommendations } from '../lib/authorityRecommendations';
import { findAuthorities } from '../lib/authorities';

jest.mock('../lib/authorities', () => ({
  findAuthorities: jest.fn(),
}));

describe('authority recommendations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('withholds unverified directory entries and provides department-level ideas', async () => {
    jest.mocked(findAuthorities).mockResolvedValue([{
      name: 'Example Municipal Department',
      handle: '@ExampleCivic',
      confidence: 0.8,
      matchReason: 'City + Category match',
      sourceUrl: 'https://example.gov',
      verificationStatus: 'seed',
    } as never]);

    const recommendations = await getAuthorityRecommendations(19, 72, 'Mumbai, Maharashtra', 'pothole');
    expect(findAuthorities).toHaveBeenCalledWith({
      lat: 19, lng: 72, city: 'Mumbai', state: 'Maharashtra', category: 'pothole',
    });
    expect(recommendations.accounts).toEqual([]);
    expect(recommendations.unverifiedDirectoryMatches).toBe(true);
    expect(recommendations.departments).toEqual(['Municipal public works or roads department']);
  });

  it('returns a verified public account with safe provenance and relevant match reason', async () => {
    jest.mocked(findAuthorities).mockResolvedValue([{
      id: 'authority-1',
      name: 'Verified Municipal Department',
      socialMedia: {
        twitter: {
          handle: '@VerifiedCivic',
          verified: true,
          active: true,
          url: 'https://x.com/VerifiedCivic',
        },
      },
      jurisdiction: { geohashes: ['tdr'] },
      sourceUrl: 'https://example.gov/',
      lastVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
      verificationStatus: 'verified',
    } as never]);

    const recommendations = await getAuthorityRecommendations(19, 72, 'Mumbai, Maharashtra', 'pothole');
    expect(recommendations.accounts.map((authority) => authority.handle)).toEqual(['@VerifiedCivic']);
    expect(recommendations.accounts[0]).toMatchObject({
      id: 'authority-1',
      verificationStatus: 'verified',
      profileUrl: 'https://x.com/VerifiedCivic',
      sourceUrl: 'https://example.gov/',
      matchReason: expect.stringContaining('in Mumbai'),
    });
    expect(recommendations.unverifiedDirectoryMatches).toBe(false);
  });

  it('provides safe department-level guidance without inventing an account', async () => {
    const recommendations = await getAuthorityRecommendations(undefined, undefined, 'Unknown location', 'water_supply');
    expect(findAuthorities).not.toHaveBeenCalled();
    expect(recommendations.accounts).toEqual([]);
    expect(recommendations.unverifiedDirectoryMatches).toBe(false);
    expect(recommendations.departments).toEqual(['Local water-supply utility or municipal water department']);
  });

  it('surfaces directory lookup errors instead of hiding them as an empty result', async () => {
    jest.mocked(findAuthorities).mockRejectedValue(new Error('Supabase directory unavailable'));
    await expect(getAuthorityRecommendations(19, 72, 'Mumbai, Maharashtra', 'pothole'))
      .rejects.toThrow('Supabase directory unavailable');
  });

  it('rejects mismatched account profile links and deduplicates handles', async () => {
    jest.mocked(findAuthorities).mockResolvedValue([
      {
        id: 'authority-1',
        name: 'Verified Municipal Department',
        socialMedia: { twitter: { handle: '@VerifiedCivic', verified: true, active: true, url: 'https://x.com/not-the-handle' } },
        jurisdiction: { geohashes: [] },
        verificationStatus: 'verified',
      },
      {
        id: 'authority-2',
        name: 'Verified Municipal Department duplicate',
        socialMedia: { twitter: { handle: '@verifiedcivic', verified: true, active: true } },
        jurisdiction: { geohashes: [] },
        verificationStatus: 'verified',
      },
    ] as never);

    const recommendations = await getAuthorityRecommendations(undefined, undefined, 'Mumbai, Maharashtra', 'pothole');
    expect(recommendations.accounts).toHaveLength(1);
    expect(recommendations.accounts[0].profileUrl).toBeUndefined();
  });
});
