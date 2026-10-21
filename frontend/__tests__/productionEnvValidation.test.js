const { validateProductionEnv } = require('../scripts/validate-production-env');

const validEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://civic-vigilance.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key-for-test-only',
  EXPO_PUBLIC_STORAGE_BUCKET: 'issue-photos',
  EXPO_PUBLIC_PRIVATE_STORAGE_BUCKET: 'private-issue-photos',
  EXPO_PUBLIC_NODE_API_URL: 'https://api.civicvigilance.example/api',
  EXPO_PUBLIC_API_URL: 'https://civic-vigilance.supabase.co/functions/v1',
  EXPO_PUBLIC_BACKEND_MODE: 'supabase',
};

describe('production environment validation', () => {
  test('accepts HTTPS endpoints for one Supabase project and a deployed Node API', () => {
    expect(validateProductionEnv(validEnvironment)).toEqual([]);
  });

  test('rejects a Functions endpoint for a different Supabase project', () => {
    const invalid = validateProductionEnv({
      ...validEnvironment,
      EXPO_PUBLIC_API_URL: 'https://different-project.supabase.co/functions/v1',
    });

    expect(invalid).toContain(
      'EXPO_PUBLIC_API_URL (must use this Supabase project at /functions/v1)',
    );
  });

  test('rejects a loopback or non-HTTPS release API', () => {
    const invalid = validateProductionEnv({
      ...validEnvironment,
      EXPO_PUBLIC_NODE_API_URL: 'http://localhost:3000/api',
    });

    expect(invalid).toContain('EXPO_PUBLIC_NODE_API_URL (must use HTTPS)');
    expect(invalid).toContain(
      'EXPO_PUBLIC_NODE_API_URL (must not use localhost or a local network host)',
    );
  });

  test('rejects a private-network release API', () => {
    const invalid = validateProductionEnv({
      ...validEnvironment,
      EXPO_PUBLIC_NODE_API_URL: 'https://192.168.1.20/api',
    });

    expect(invalid).toContain(
      'EXPO_PUBLIC_NODE_API_URL (must not use localhost or a local network host)',
    );
  });

  test('rejects the production web app as the Node API deployment', () => {
    const invalid = validateProductionEnv({
      ...validEnvironment,
      EXPO_PUBLIC_NODE_API_URL: 'https://civic-vigilance-app.vercel.app/api',
    });

    expect(invalid).toContain(
      'EXPO_PUBLIC_NODE_API_URL (must target the separate backend deployment, not the production web app)',
    );
  });

  test('rejects service-role keys from frontend configuration', () => {
    const serviceRoleKey = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
    const invalid = validateProductionEnv({
      ...validEnvironment,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: serviceRoleKey,
    });

    expect(invalid).toContain(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY (must not be a service-role/secret key)',
    );
  });
});
