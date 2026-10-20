import {
  PRODUCTION_NODE_API_BASE_URL,
  resolveNodeApiBaseUrl,
} from '../lib/nodeApiUrl';

describe('Node API base URL selection', () => {
  test('keeps a configured localhost API for development', () => {
    expect(resolveNodeApiBaseUrl('http://localhost:3000/api/', true))
      .toBe('http://localhost:3000/api');
  });

  test('uses production API when a release build receives a localhost URL', () => {
    expect(resolveNodeApiBaseUrl('http://localhost:3000/api', false))
      .toBe(PRODUCTION_NODE_API_BASE_URL);
    expect(resolveNodeApiBaseUrl('http://127.0.0.1:3000/api', false))
      .toBe(PRODUCTION_NODE_API_BASE_URL);
  });

  test('uses a configured HTTPS API in release builds', () => {
    expect(resolveNodeApiBaseUrl('https://api.example.org/api/', false))
      .toBe('https://api.example.org/api');
  });

  test('falls back to the known production API for missing or invalid release config', () => {
    expect(resolveNodeApiBaseUrl(undefined, false)).toBe(PRODUCTION_NODE_API_BASE_URL);
    expect(resolveNodeApiBaseUrl('not a URL', false)).toBe(PRODUCTION_NODE_API_BASE_URL);
  });

  test('does not silently select production when development config is absent or invalid', () => {
    expect(resolveNodeApiBaseUrl(undefined, true)).toBeNull();
    expect(resolveNodeApiBaseUrl('not a URL', true)).toBeNull();
  });
});
