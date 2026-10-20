/**
 * Simple Backend Integration Test (Node.js compatible)
 * Tests configuration and Supabase connection
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const results = [];

function log(name, status, message, details = null) {
  results.push({ name, status, message, details });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'WARN' ? '⚠' : '○';
  console.log(`[${icon}] ${name}: ${message}`);
  if (details) {
    console.log(`    Details:`, details);
  }
}

async function testConfiguration() {
  console.log('\n=== Configuration Tests ===\n');

  // Test 1: Backend mode
  const backend = process.env.EXPO_PUBLIC_BACKEND_MODE || 'supabase';
  log('Backend Mode', 'PASS', `Backend mode is set to: ${backend}`);

  // Test 2: Supabase configuration
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

  log(
    'Supabase Configuration',
    isSupabaseConfigured ? 'PASS' : 'FAIL',
    isSupabaseConfigured
      ? 'Supabase URL and anon key are set'
      : 'Supabase URL or anon key is missing',
    {
      url: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING',
      anonKey: supabaseAnonKey ? 'SET (hidden)' : 'MISSING',
    }
  );

  // X OAuth configuration is server-side and cannot be validated by the app.
  log(
    'X OAuth Configuration',
    'SKIP',
    'X OAuth credentials are server-side; use backend tests and the hosting configuration checklist',
  );

  // Test 4: Google Maps API
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapsConfigured = mapsKey && mapsKey !== 'your_google_maps_api_key';
  log(
    'Google Maps API Configuration',
    mapsConfigured ? 'PASS' : 'WARN',
    mapsConfigured
      ? 'Google Maps API key is configured'
      : 'Google Maps API key is not configured (using placeholder)'
  );

  // Test 5: Cloud Functions API URL
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  const apiConfigured = apiUrl && !apiUrl.includes('your-project');
  log(
    'Cloud Functions API URL',
    apiConfigured ? 'PASS' : 'WARN',
    apiConfigured
      ? 'Cloud Functions API URL is configured'
      : 'Cloud Functions API URL is not configured (using placeholder)'
  );

  return isSupabaseConfigured;
}

async function testSupabaseConnection() {
  console.log('\n=== Supabase Connection Tests ===\n');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    log('Supabase Connection', 'SKIP', 'Supabase is not configured, skipping connection tests');
    return false;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Test 1: Basic connection - try to access profiles table
    try {
      const { data, error } = await supabase.from('profiles').select('count').limit(0);
      if (error) {
        log('Supabase Connection', 'FAIL', `Failed to connect to Supabase: ${error.message}`, error);
      } else {
        log('Supabase Connection', 'PASS', 'Successfully connected to Supabase');
      }
    } catch (err) {
      log('Supabase Connection', 'FAIL', `Error connecting to Supabase: ${err.message}`);
    }

    // Test 2: Auth session check
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        log('Supabase Auth Session', 'WARN', `Auth session check failed: ${error.message}`);
      } else {
        log(
          'Supabase Auth Session',
          'PASS',
          data.session ? 'User is authenticated' : 'No active session (expected)',
          data.session ? { user: data.session.user.email } : null
        );
      }
    } catch (err) {
      log('Supabase Auth Session', 'FAIL', `Error checking auth session: ${err.message}`);
    }

    return true;
  } catch (err) {
    log('Supabase Client', 'FAIL', `Failed to create Supabase client: ${err.message}`);
    return false;
  }
}

async function testDatabaseSchema() {
  console.log('\n=== Database Schema Tests ===\n');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    log('Database Schema', 'SKIP', 'Supabase is not configured, skipping database tests');
    return false;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const tables = ['profiles', 'issues', 'votes', 'comments', 'authorities'];

  let allTablesOk = true;
  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table).select('count').limit(0);
      if (error) {
        log(`Table: ${table}`, 'FAIL', `Table access failed: ${error.message}`, error);
        allTablesOk = false;
      } else {
        log(`Table: ${table}`, 'PASS', `Table exists and is accessible`);
      }
    } catch (err) {
      log(`Table: ${table}`, 'FAIL', `Error accessing table: ${err.message}`);
      allTablesOk = false;
    }
  }

  return allTablesOk;
}

async function testAuthenticationFlow() {
  console.log('\n=== Authentication Tests ===\n');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    log('Authentication Flow', 'SKIP', 'Supabase is not configured, skipping auth tests');
    return false;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Test 1: Sign up capability
  log('Sign Up Capability', 'PASS', 'Sign up functions are available (not testing to avoid creating test users)', {
    availableMethods: ['signUp', 'signInWithPassword', 'signOut', 'resetPasswordForEmail'],
  });

  // Test 2: Auth state change listener
  try {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // This is just to test if the listener is available
    });
    data.subscription.unsubscribe();
    log('Auth State Listener', 'PASS', 'Auth state change listener is functional');
  } catch (err) {
    log('Auth State Listener', 'FAIL', `Error setting up auth listener: ${err.message}`);
  }

  // Test 3: Current session
  try {
    const { data, error } = await supabase.auth.getSession();
    log(
      'Current Session Check',
      'PASS',
      data.session ? 'User is signed in' : 'No active session',
      data.session ? { userId: data.session.user.id } : null
    );
  } catch (err) {
    log('Current Session Check', 'FAIL', `Error checking session: ${err.message}`);
  }

  return true;
}

async function testTwitterIntegration() {
  console.log('\n=== Twitter Integration Tests ===\n');
  log(
    'X Account Linking',
    'SKIP',
    'Live X authorization is not run by this frontend diagnostic; verify using the backend OAuth tests and configured X Developer Portal',
  );
  return false;
}

async function printSummary() {
  console.log('\n=== Test Summary ===\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const warned = results.filter((r) => r.status === 'WARN').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`⚠ Warnings: ${warned}`);
  console.log(`○ Skipped: ${skipped}`);

  console.log('\n=== Recommendations ===\n');

  const warnings = results.filter((r) => r.status === 'WARN' || r.status === 'FAIL');
  if (warnings.length === 0) {
    console.log('✓ All systems are properly configured and working!');
  } else {
    warnings.forEach((w) => {
      console.log(`• ${w.name}: ${w.message}`);
    });
  }

  console.log('\n');

  return failed === 0;
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Civic Vigilance - Backend Integration Test Suite         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    const configOk = await testConfiguration();
    const supabaseOk = await testSupabaseConnection();
    const dbOk = await testDatabaseSchema();
    const authOk = await testAuthenticationFlow();
    const twitterOk = await testTwitterIntegration();

    const success = await printSummary();

    console.log('\n=== Component Status ===\n');
    console.log(`Backend Configuration: ${configOk ? '✓ OK' : '✗ ISSUES'}`);
    console.log(`Supabase Connection: ${supabaseOk ? '✓ OK' : '⚠ NOT CONFIGURED'}`);
    console.log(`Database Schema: ${dbOk ? '✓ OK' : '⚠ ISSUES'}`);
    console.log(`Authentication: ${authOk ? '✓ OK' : '⚠ NOT CONFIGURED'}`);
    console.log(`Twitter Integration: ${twitterOk ? '✓ OK' : '⚠ NOT CONFIGURED'}`);

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite encountered an error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runAllTests();
