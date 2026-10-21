const fs = require('fs');
const path = require('path');
const { validateProductionEnv } = require('./validate-production-env');

const publicTableProbes = [
  {
    table: 'issues',
    columns: 'id,user_id,title,description,category,photos,location,address,geohash,privacy,status,anonymous_username,flagged,reviewed,moderation_status,visibility,location_confirmed,created_at,updated_at,issue_metrics(upvotes,downvotes,comments,shares,twitter_impressions)',
  },
  { table: 'comments', columns: 'id,issue_id,user_id,parent_id,content,created_at,updated_at,edited' },
  { table: 'votes', columns: 'id,issue_id,user_id,vote,created_at' },
  { table: 'issue_metrics', columns: 'issue_id,upvotes,downvotes,comments,shares,twitter_impressions' },
  { table: 'authorities', columns: 'id,name,social_media,status,verification_status,source_url,last_verified_at' },
  { table: 'notifications', columns: 'id,user_id,type,title,body,read,created_at' },
];

const ownerOrServiceOnlyProbes = [
  { table: 'profiles', columns: 'id,username,full_name,first_name,last_name,phone_number,updated_at' },
  { table: 'users', columns: 'id,email,username,full_name,display_name,photo_url,updated_at' },
  { table: 'user_preferences', columns: 'user_id,notify_nearby,notify_comments,notify_upvotes,notify_replies,notify_twitter,notify_digest,notify_trending,notify_similar,updated_at' },
  { table: 'user_stats', columns: 'user_id,total_posts,total_upvotes,total_comments,total_shares' },
  { table: 'issue_events', columns: 'id,issue_id,event_type,source,details,created_by,created_at' },
  { table: 'follow_up_reminders', columns: 'id,issue_id,user_id,due_at,status,created_at' },
  { table: 'issue_authority_suggestions', columns: 'id,issue_id,user_id,authority_id,display_name,public_handle,category,relevance_reason,selected,created_at' },
  { table: 'issue_generated_content', columns: 'id,issue_id,user_id,generation_id,category,content_type,generated_content,created_at' },
  { table: 'bluesky_publications', columns: 'report_id,user_id,status,post_uri,post_url,created_at,updated_at' },
];

async function probe({ table, columns }, restrictedAccessExpected) {
  const endpoint = new URL(`/rest/v1/${table}`, process.env.EXPO_PUBLIC_SUPABASE_URL);
  endpoint.searchParams.set('select', columns);
  endpoint.searchParams.set('limit', '0');

  const response = await fetch(endpoint, {
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  });
  let errorCode = '';
  if (!response.ok) {
    try {
      errorCode = (await response.json()).code || '';
    } catch {
      errorCode = '';
    }
  }

  if (response.ok) {
    console.log(`${table}: schema resolved (HTTP ${response.status})`);
    return true;
  }
  if (restrictedAccessExpected && (response.status === 401 || response.status === 403) && errorCode === '42501') {
    console.log(`${table}: schema resolved; anonymous access denied by design (42501)`);
    return true;
  }

  console.error(`${table}: schema probe failed (HTTP ${response.status}${errorCode ? ` ${errorCode}` : ''})`);
  return false;
}

async function checkNodeApi() {
  const baseUrl = process.env.EXPO_PUBLIC_NODE_API_URL.replace(/\/+$/, '');
  const endpoint = new URL('health', `${baseUrl}/`);
  try {
    const response = await fetch(endpoint);
    if (!response.ok) {
      console.error(`Node API health check failed (HTTP ${response.status}).`);
      return false;
    }
    const health = await response.json();
    if (health.status !== 'ok' || health.service !== 'civic-vigilance-api') {
      console.error('Node API returned an unexpected health response.');
      return false;
    }
    console.log('Node API health check passed.');
    let routesValid = true;
    const protectedRoutes = [
      { method: 'GET', path: '/report-ai/capabilities' },
      { method: 'GET', path: '/account/export' },
      { method: 'GET', path: '/social/bluesky/status?issue_id=11111111-1111-4111-8111-111111111111' },
      { method: 'GET', path: '/x/connection' },
      { method: 'POST', path: '/analyze-image' },
      { method: 'POST', path: '/generate-report-content' },
      { method: 'POST', path: '/social/bluesky/publish' },
      { method: 'POST', path: '/x/connect' },
      { method: 'DELETE', path: '/account' },
      { method: 'DELETE', path: '/x/connection' },
    ];
    for (const route of protectedRoutes) {
      try {
        const routeResponse = await fetch(new URL(route.path.slice(1), `${baseUrl}/`), {
          method: route.method,
        });
        await routeResponse.arrayBuffer();
        if (routeResponse.status !== 401) {
          console.error(`Node API route ${route.method} ${route.path} returned HTTP ${routeResponse.status}; expected 401 without an access token.`);
          routesValid = false;
        } else {
          console.log(`Node API route ${route.method} ${route.path} is present and requires authentication.`);
        }
      } catch (error) {
        console.error(`Node API route ${route.method} ${route.path} check could not complete (${error.name || 'network error'}).`);
        routesValid = false;
      }
    }
    try {
      const callbackResponse = await fetch(new URL(
        'x/connect/callback?error=access_denied&state=invalid',
        `${baseUrl}/`,
      ), { redirect: 'manual' });
      await callbackResponse.arrayBuffer();
      if (![302, 503].includes(callbackResponse.status)) {
        console.error(`Node API OAuth callback returned HTTP ${callbackResponse.status}; expected 302 or 503, not a missing route.`);
        routesValid = false;
      } else {
        console.log(`Node API OAuth callback is present (HTTP ${callbackResponse.status}).`);
      }
    } catch (error) {
      console.error(`Node API OAuth callback check could not complete (${error.name || 'network error'}).`);
      routesValid = false;
    }
    return routesValid;
  } catch (error) {
    console.error(`Node API health check could not complete (${error.name || 'network error'}).`);
    return false;
  }
}

async function main() {
  const envFiles = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '.env'),
  ];
  const envFile = envFiles.find((candidate) => fs.existsSync(candidate));
  if (envFile) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }

  const invalidConfiguration = validateProductionEnv(process.env);
  if (invalidConfiguration.length) {
    console.error(`Supabase schema check requires valid build configuration:\n- ${invalidConfiguration.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }

  let hasFailures = false;
  for (const query of publicTableProbes) {
    if (!await probe(query, false)) hasFailures = true;
  }
  for (const query of ownerOrServiceOnlyProbes) {
    if (!await probe(query, true)) hasFailures = true;
  }
  if (!await checkNodeApi()) hasFailures = true;
  if (hasFailures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Supabase schema check could not complete (${error.name || 'network error'}).`);
  process.exitCode = 1;
});
