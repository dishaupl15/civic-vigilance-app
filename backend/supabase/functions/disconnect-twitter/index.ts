// Retired with the server-side X OAuth integration.
import { retiredTwitterHandler } from '../_shared/retired-twitter.ts';

Deno.serve(retiredTwitterHandler(
  'Server-side X account connections are retired.',
  'TWITTER_OAUTH_RETIRED',
));
