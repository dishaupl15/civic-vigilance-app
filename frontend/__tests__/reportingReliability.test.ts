import { createComplaintDraft } from '../lib/complaintDraft';
import { composePostText } from '../lib/sharingEnhanced';
import {
  isValidCoordinate,
  normalizeReportAddress,
  parseOptionalCoordinates,
  validateEvidencePhotos,
  validateReportAddress,
  validateReportLocation,
} from '../lib/reportValidation';

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ canOpenURL: jest.fn(), openURL: jest.fn() }));
jest.mock('expo-file-system', () => ({ cacheDirectory: '/cache/', copyAsync: jest.fn() }));

describe('reporting reliability', () => {
  test('rejects invalid coordinates without inventing a fallback', () => {
    expect(isValidCoordinate(91, 10)).toBe(false);
    expect(parseOptionalCoordinates('', '').coordinates).toBeNull();
    expect(parseOptionalCoordinates('19.07', '')).toEqual({
      coordinates: null,
      error: 'Enter both latitude and longitude, or leave both blank.',
    });
    expect(parseOptionalCoordinates('', '72.87')).toEqual({
      coordinates: null,
      error: 'Enter both latitude and longitude, or leave both blank.',
    });
    expect(parseOptionalCoordinates(' ', '72.87')).toEqual({
      coordinates: null,
      error: 'Enter both latitude and longitude, or leave both blank.',
    });
    expect(parseOptionalCoordinates('19.07', '72.87').coordinates).toEqual({ lat: 19.07, lng: 72.87 });
  });

  test('validates report coordinate pairs and accuracy metadata', () => {
    expect(validateReportLocation(19.07, 72.87, 18)).toBeNull();
    expect(validateReportLocation(undefined, undefined)).toBeNull();
    expect(validateReportLocation(Number.NaN, 72.87)).toBe('Coordinates are outside valid ranges');
    expect(validateReportLocation(19.07, undefined)).toBe('Latitude and longitude must be provided together');
    expect(validateReportLocation(19.07, 72.87, Number.POSITIVE_INFINITY))
      .toBe('Location accuracy must be a non-negative finite number and requires coordinates');
    expect(validateReportLocation(undefined, undefined, 18))
      .toBe('Location accuracy must be a non-negative finite number and requires coordinates');
  });

  test('includes valid zero-valued coordinates in shared location links', () => {
    expect(composePostText({ title: 'Civic issue', lat: 0, lng: 0 }))
      .toContain('https://maps.google.com/?q=0,0');
    expect(composePostText({ title: 'Civic issue', lat: 0, lng: 20 }))
      .toContain('https://maps.google.com/?q=0,20');
    expect(composePostText({ title: 'Civic issue', lat: Number.NaN, lng: 20 }))
      .not.toContain('maps.google.com');
  });

  test('normalizes and validates confirmed report addresses', () => {
    expect(normalizeReportAddress('  MG Road,\n  Bengaluru  ')).toBe('MG Road, Bengaluru');
    expect(validateReportAddress(' MG Road, Bengaluru ')).toBeNull();
    expect(validateReportAddress(' \n\t ')).toMatch(/enter a location manually/i);
    expect(validateReportAddress('x'.repeat(301))).toMatch(/300 characters or fewer/i);
  });

  test('requires one to three genuine evidence references', () => {
    expect(validateEvidencePhotos([])).toBe(false);
    expect(validateEvidencePhotos(['file:///camera/evidence.jpg'])).toBe(true);
    expect(validateEvidencePhotos(['https://picsum.photos/800/500'])).toBe(false);
    expect(validateEvidencePhotos(['a', 'b', 'c', 'd'])).toBe(false);
  });

  test('complaint draft stays factual and labels jurisdiction as proposed', () => {
    const draft = createComplaintDraft({
      category: 'pothole', description: 'Broken asphalt is visible.', address: 'MG Road, Bengaluru',
      observedAt: new Date('2026-01-01T10:00:00Z'), photoReferences: ['evidence.jpg'], authorityName: 'Example Authority',
    });
    expect(draft).toContain('Broken asphalt is visible.');
    expect(draft).toContain('please verify jurisdiction');
    expect(draft).not.toMatch(/injury|negligence|accident/i);
  });
});
