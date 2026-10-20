import { act, renderHook } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { reverseGeocode } from '../lib/location';
import { useLiveLocation } from '../hooks/useLiveLocation';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getProviderStatusAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('../lib/location', () => ({
  reverseGeocode: jest.fn(),
}));

const mockedLocation = jest.mocked(Location);
const mockedReverseGeocode = jest.mocked(reverseGeocode);

const position: Location.LocationObject = {
  coords: {
    latitude: 19.076,
    longitude: 72.8777,
    altitude: null,
    accuracy: 18,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
};

describe('useLiveLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    mockedLocation.getProviderStatusAsync.mockResolvedValue({
      locationServicesEnabled: true,
      backgroundModeEnabled: false,
    });
    mockedLocation.getCurrentPositionAsync.mockResolvedValue(position);
    mockedReverseGeocode.mockResolvedValue('Central Mumbai');
  });

  it('captures a one-time location after permission and service checks', async () => {
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(mockedLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedLocation.getProviderStatusAsync).toHaveBeenCalledTimes(1);
    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.High,
    });
    expect(result.current.coords).toEqual({
      lat: 19.076,
      lng: 72.8777,
      accuracy: 18,
      capturedAt: position.timestamp,
    });
    expect(result.current.address).toBe('Central Mumbai');
    expect(result.current.error).toBeNull();
  });

  it('requests foreground permission when permission can still be requested', async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
      expires: 'never',
    });
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(mockedLocation.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.current.permissionStatus).toBe('granted');
    expect(result.current.coords?.lat).toBe(19.076);
  });

  it('does not retry blocked permission and leaves manual location entry available', async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(mockedLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(result.current.canAskAgain).toBe(false);
    expect(result.current.error).toContain('enter the address manually');
  });

  it('reports disabled device location services without losing manual fallback', async () => {
    mockedLocation.getProviderStatusAsync.mockResolvedValue({
      locationServicesEnabled: false,
      backgroundModeEnabled: false,
    });
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(mockedLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(result.current.error).toContain('Turn on device Location Services');
  });

  it('keeps captured coordinates but requests a manual address when reverse geocoding has no result', async () => {
    mockedReverseGeocode.mockResolvedValue('');
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.coords?.lat).toBe(19.076);
    expect(result.current.address).toBe('');
    expect(result.current.error).toContain('address could not be resolved');
  });

  it('surfaces a safe recoverable error when the location request throws', async () => {
    mockedLocation.getCurrentPositionAsync.mockRejectedValue(new Error('native provider detail'));
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.error).toBe(
      'Unable to get your location. Check Location Services or enter the address manually.'
    );
    expect(result.current.error).not.toContain('native provider detail');
  });

  it('allows retry after an unavailable location result and retains reported accuracy', async () => {
    mockedLocation.getCurrentPositionAsync
      .mockRejectedValueOnce(new Error('temporary provider failure'))
      .mockResolvedValueOnce({
        ...position,
        coords: { ...position.coords, accuracy: 250 },
      });
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });
    expect(result.current.coords).toBeNull();
    expect(result.current.error).toBeTruthy();

    await act(async () => {
      await result.current.requestLocation();
    });
    expect(result.current.coords?.accuracy).toBe(250);
    expect(result.current.error).toBeNull();
  });

  it('rejects stale fixes and does not retain the previous result after refresh fails', async () => {
    mockedLocation.getCurrentPositionAsync
      .mockResolvedValueOnce(position)
      .mockResolvedValueOnce({
        ...position,
        timestamp: Date.now() - 3 * 60 * 1000,
      });
    const { result } = renderHook(() => useLiveLocation());

    await act(async () => {
      await result.current.requestLocation();
    });
    expect(result.current.coords).not.toBeNull();

    await act(async () => {
      await result.current.requestLocation();
    });

    expect(result.current.coords).toBeNull();
    expect(result.current.address).toBe('');
    expect(result.current.error).toContain('outdated location');
  });

  it('times out a location fix and leaves manual address entry available', async () => {
    jest.useFakeTimers();
    try {
      mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => undefined));
      const { result } = renderHook(() => useLiveLocation());
      let request!: Promise<boolean>;

      await act(async () => {
        request = result.current.requestLocation();
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
      });
      expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(20_000);
        await request;
      });

      expect(result.current.coords).toBeNull();
      expect(result.current.error).toContain('Unable to get your location');
      expect(result.current.loading).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps a valid fix when reverse geocoding times out and allows manual address entry', async () => {
    jest.useFakeTimers();
    try {
      mockedReverseGeocode.mockReturnValue(new Promise(() => undefined));
      const { result } = renderHook(() => useLiveLocation());
      let request!: Promise<boolean>;

      await act(async () => {
        request = result.current.requestLocation();
        for (let index = 0; index < 8; index += 1) await Promise.resolve();
      });
      expect(result.current.coords?.lat).toBe(19.076);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
        await request;
      });

      expect(result.current.coords?.lat).toBe(19.076);
      expect(result.current.address).toBe('');
      expect(result.current.error).toContain('address could not be resolved');
    } finally {
      jest.useRealTimers();
    }
  });

  it('ignores duplicate requests while a location fix is pending', async () => {
    let resolvePosition!: (value: Location.LocationObject) => void;
    mockedLocation.getCurrentPositionAsync.mockReturnValue(
      new Promise((resolve) => {
        resolvePosition = resolve;
      })
    );
    const { result } = renderHook(() => useLiveLocation());
    let firstRequest!: Promise<boolean>;

    await act(async () => {
      firstRequest = result.current.requestLocation();
    });

    await act(async () => {
      expect(await result.current.requestLocation()).toBe(false);
    });
    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePosition(position);
      await firstRequest;
    });
  });
});
