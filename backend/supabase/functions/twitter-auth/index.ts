// Retired: the app opens the user's X composer and stores no X OAuth tokens.
import { retiredTwitterHandler } from '../_shared/retired-twitter.ts';

Deno.serve(retiredTwitterHandler(
  'Server-side X account connections are retired. Use the in-app Share on X action.',
  'TWITTER_OAUTH_RETIRED',
));
