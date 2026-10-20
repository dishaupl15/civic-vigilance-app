import * as Location from 'expo-location';
import { reverseGeocode } from '../lib/location';

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: jest.fn(),
}));

const mockedReverseGeocode = jest.mocked(Location.reverseGeocodeAsync);

describe('reverseGeocode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('formats only address components returned by the provider', async () => {
    mockedReverseGeocode.mockResolvedValue([{
      name: null,
      street: 'MG Road',
      district: null,
      city: 'Mumbai',
      region: null,
      postalCode: null,
    }]);

    await expect(reverseGeocode(19.07, 72.87)).resolves.toBe('MG Road, Mumbai');
  });

  it('returns an empty address when the provider has no usable components', async () => {
    mockedReverseGeocode.mockResolvedValue([{
      name: null,
      street: null,
      district: null,
      city: null,
      region: null,
      postalCode: null,
    }]);

    await expect(reverseGeocode(19.07, 72.87)).resolves.toBe('');
  });

  it('allows manual address entry when the provider fails', async () => {
    mockedReverseGeocode.mockRejectedValue(new Error('provider unavailable'));

    await expect(reverseGeocode(19.07, 72.87)).resolves.toBe('');
  });
});
