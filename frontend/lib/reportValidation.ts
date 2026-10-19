export function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function parseOptionalCoordinates(latitude: string, longitude: string) {
  const hasEither = latitude.trim() !== '' || longitude.trim() !== '';
  if (!hasEither) return { coordinates: null as { lat: number; lng: number } | null, error: null as string | null };
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!isValidCoordinate(lat, lng)) return { coordinates: null, error: 'Coordinates are outside valid ranges.' };
  return { coordinates: { lat, lng }, error: null };
}

export function validateEvidencePhotos(photos: string[]) {
  if (photos.length < 1 || photos.length > 3) return false;
  return photos.every((uri) => typeof uri === 'string' && uri.trim().length > 0 && !/^https?:\/\/(picsum\.photos|via\.placeholder\.com)/i.test(uri));
}
