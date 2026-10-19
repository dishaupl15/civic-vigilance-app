import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { reverseGeocode } from '../lib/location';
import { isValidCoordinate } from '../lib/reportValidation';

export type LiveCoordinates = {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt: number;
};

export function useLiveLocation() {
  const [coords, setCoords] = useState<LiveCoordinates | null>(null);
  const [address, setAddress] = useState('');
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | 'undetermined'>('undetermined');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchSub = useRef<Location.LocationSubscription | null>(null);
  const lastGeocode = useRef<{ lat: number; lng: number } | null>(null);

  const updateLocation = useCallback(async (loc: Location.LocationObject) => {
    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    if (!isValidCoordinate(lat, lng)) {
      setError('The device returned invalid coordinates. Enter the location manually.');
      return;
    }

    setCoords({ lat, lng, accuracy: loc.coords.accuracy ?? undefined, capturedAt: loc.timestamp });
    const last = lastGeocode.current;
    const movedEnough = !last || Math.abs(last.lat - lat) + Math.abs(last.lng - lng) > 0.00025;
    if (movedEnough) {
      lastGeocode.current = { lat, lng };
      const resolved = await reverseGeocode(lat, lng);
      if (resolved) setAddress(resolved);
    }
  }, []);

  const requestLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(permission.status);
      if (permission.status !== 'granted') {
        setError(permission.canAskAgain
          ? 'Location permission was not granted. You can enter an address manually.'
          : 'Location permission is blocked. Enable it in settings or enter an address manually.');
        return false;
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await updateLocation(current);
      watchSub.current?.remove();
      watchSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (next) => void updateLocation(next)
      );
      return true;
    } catch (cause: any) {
      setError(cause?.message || 'Unable to determine your location. Enter it manually.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [updateLocation]);

  useEffect(() => () => watchSub.current?.remove(), []);

  return { coords, address, accuracy: coords?.accuracy, permissionStatus, loading, error, requestLocation };
}
