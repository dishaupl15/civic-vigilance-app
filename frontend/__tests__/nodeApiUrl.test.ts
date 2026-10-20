import { resolveNodeApiBaseUrl } from '../lib/nodeApiUrl';

describe('Node API base URL selection', () => {
  test('keeps a configured localhost API for development', () => {
    expect(resolveNodeApiBaseUrl('http://localhost:3000/api/', true))
      .toBe('http://localhost:3000/api');
  });

  test('rejects a localhost API in release builds', () => {
    expect(resolveNodeApiBaseUrl('http://localhost:3000/api', false))
      .toBeNull();
    expect(resolveNodeApiBaseUrl('http://127.0.0.1:3000/api', false))
      .toBeNull();
  });

  test('uses a configured HTTPS API in release builds', () => {
    expect(resolveNodeApiBaseUrl('https://api.example.org/api/', false))
      .toBe('https://api.example.org/api');
  });

  test('requires an explicitly configured API in release builds', () => {
    expect(resolveNodeApiBaseUrl(undefined, false)).toBeNull();
    expect(resolveNodeApiBaseUrl('not a URL', false)).toBeNull();
  });

  test('does not silently select production when development config is absent or invalid', () => {
    expect(resolveNodeApiBaseUrl(undefined, true)).toBeNull();
    expect(resolveNodeApiBaseUrl('not a URL', true)).toBeNull();
  });
});
