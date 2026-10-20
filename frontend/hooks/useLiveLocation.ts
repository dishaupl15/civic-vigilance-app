import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import * as Location from 'expo-location';
import { reverseGeocode } from '../lib/location';
import { isValidCoordinate } from '../lib/reportValidation';

const LOCATION_REQUEST_TIMEOUT_MS = 20_000;
const REVERSE_GEOCODE_TIMEOUT_MS = 10_000;
const MAX_LOCATION_AGE_MS = 2 * 60 * 1000;
const MAX_FUTURE_LOCATION_SKEW_MS = 60 * 1000;

export type LiveCoordinates = {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt: number;
};

function withTimeout<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Location request timed out.')), timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => clearTimeout(timer));
}

export function useLiveLocation() {
  const [coords, setCoords] = useState<LiveCoordinates | null>(null);
  const [address, setAddress] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | 'undetermined'>('undetermined');
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const requesting = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const requestLocation = useCallback(async () => {
    if (requesting.current) return false;
    requesting.current = true;
    setLoading(true);
    setError(null);
    setCoords(null);
    setAddress('');

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== 'granted' && permission.canAskAgain) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!mounted.current) return false;

      setPermissionStatus(permission.status);
      setCanAskAgain(permission.canAskAgain);
      if (permission.status !== 'granted') {
        setError('Location permission is unavailable. You can enter the address manually.');
        return false;
      }

      const providerStatus = await Location.getProviderStatusAsync();
      if (!mounted.current) return false;
      if (!providerStatus.locationServicesEnabled) {
        setError('Turn on device Location Services or enter the address manually.');
        return false;
      }

      const current = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        LOCATION_REQUEST_TIMEOUT_MS
      );
      const lat = current.coords.latitude;
      const lng = current.coords.longitude;
      if (!isValidCoordinate(lat, lng) || !Number.isFinite(current.timestamp)) {
        setError('The device returned an invalid location. Enter the location manually.');
        return false;
      }
      const age = Date.now() - current.timestamp;
      if (age > MAX_LOCATION_AGE_MS || age < -MAX_FUTURE_LOCATION_SKEW_MS) {
        setError('The device returned an outdated location. Retry or enter the location manually.');
        return false;
      }

      const accuracy = current.coords.accuracy;
      const safeAccuracy = typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0
        ? accuracy
        : undefined;
      setCoords({ lat, lng, accuracy: safeAccuracy, capturedAt: current.timestamp });

      let resolvedAddress = '';
      try {
        resolvedAddress = await withTimeout(
          reverseGeocode(lat, lng),
          REVERSE_GEOCODE_TIMEOUT_MS
        );
      } catch {
        if (mounted.current) {
          setAddress('');
          setError('Location found, but its address could not be resolved. Enter the address manually.');
        }
        return true;
      }
      if (!mounted.current) return false;
      setAddress(resolvedAddress);
      if (!resolvedAddress) {
        setError('Location found, but its address could not be resolved. Enter the address manually.');
      }
      return true;
    } catch {
      if (mounted.current) {
        setError('Unable to get your location. Check Location Services or enter the address manually.');
      }
      return false;
    } finally {
      requesting.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  const openLocationSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      if (mounted.current) setError('Unable to open device settings. Enter the address manually.');
    }
  }, []);

  return {
    coords,
    address,
    accuracy: coords?.accuracy,
    permissionStatus,
    canAskAgain,
    loading,
    error,
    requestLocation,
    openLocationSettings,
  };
}
