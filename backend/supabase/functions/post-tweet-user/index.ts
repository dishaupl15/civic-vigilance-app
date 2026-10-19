// Retired: posting is intentionally user-mediated through the X composer.
import { retiredTwitterHandler } from '../_shared/retired-twitter.ts';

Deno.serve(retiredTwitterHandler(
  'Direct server-side posting is retired. Use the in-app Share on X action.',
  'SERVER_SIDE_POSTING_RETIRED',
));
