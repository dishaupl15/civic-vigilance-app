export function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function validateReportLocation(
  lat: number | undefined,
  lng: number | undefined,
  accuracy?: number
): string | null {
  const hasLatitude = lat !== undefined;
  const hasLongitude = lng !== undefined;
  if (hasLatitude !== hasLongitude) return 'Latitude and longitude must be provided together';
  if (hasLatitude && !isValidCoordinate(lat!, lng!)) return 'Coordinates are outside valid ranges';
  if (accuracy !== undefined && (!hasLatitude || !Number.isFinite(accuracy) || accuracy < 0)) {
    return 'Location accuracy must be a non-negative finite number and requires coordinates';
  }
  return null;
}

export function parseOptionalCoordinates(latitude: string, longitude: string) {
  const normalizedLatitude = latitude.trim();
  const normalizedLongitude = longitude.trim();
  const hasLatitude = normalizedLatitude !== '';
  const hasLongitude = normalizedLongitude !== '';
  if (!hasLatitude && !hasLongitude) {
    return { coordinates: null as { lat: number; lng: number } | null, error: null as string | null };
  }
  if (hasLatitude !== hasLongitude) {
    return { coordinates: null, error: 'Enter both latitude and longitude, or leave both blank.' };
  }
  const lat = Number(normalizedLatitude);
  const lng = Number(normalizedLongitude);
  if (!isValidCoordinate(lat, lng)) return { coordinates: null, error: 'Coordinates are outside valid ranges.' };
  return { coordinates: { lat, lng }, error: null };
}

export function validateEvidencePhotos(photos: string[]) {
  if (photos.length < 1 || photos.length > 3) return false;
  return photos.every((uri) => typeof uri === 'string' && uri.trim().length > 0 && !/^https?:\/\/(picsum\.photos|via\.placeholder\.com)/i.test(uri));
}
