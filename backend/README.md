# Civic Vigilance Backend

This folder contains the Civic Vigilance Node.js API, Supabase migrations, and retired Edge Function endpoints.

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/Vijendrapratap/Civic-Vigilance.git
   ```
2. Navigate to the backend directory:
   ```
   cd Civic-Vigilance/backend
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Create the backend environment file and add the server-only secrets:
   ```
   cp .env.example .env
   ```

## Usage

To start the server, run the following command:
```
npm start
```
The server will be running on `http://localhost:3000`; API routes are mounted under `/api`.

### Deploying to Vercel

The Vercel serverless entry point is `api/[...path].js`. To keep an existing
frontend Vercel deployment unchanged, create a separate Vercel project from
this same repository and set its Root Directory to `backend`. Vercel then
serves the Express app under `/api/*`. Configure the backend environment
variables in that new project's settings. Do not change the existing
frontend project's Root Directory to `backend`.

After deployment, verify `/api/health`, then verify that the X routes return
application responses rather than Vercel 404s. Set the frontend
`EXPO_PUBLIC_NODE_API_URL` to the new backend project's public HTTPS URL ending
in `/api`, and rebuild/re-publish the frontend app. Register
`<backend-public-https-url>/api/x/connect/callback` as the X OAuth callback
only after the backend domain is assigned and verified.

X sharing remains user-mediated through the frontend composer. Account linking
uses the separately configured backend OAuth flow below; the app does not
publish posts automatically.

## Official Civic Vigilance Bluesky publishing

After a public report is saved, its owner can preview the post and explicitly
confirm publication from the success screen. Publication uses the single
official Civic Vigilance account; app users do not connect their personal
Bluesky accounts. Private, flagged, hidden, and removed reports are not eligible.
The post contains the report title, a shortened description, Civic Vigilance
attribution, and the first report photo when it is available and suitable.
Structured addresses, coordinates, user details, and Supabase photo URLs are
not added to the post. A selected photo is retrieved server-side from
Supabase Storage, re-encoded as JPEG with embedded metadata removed, and
uploaded to Bluesky. The photo becomes public with the post; review it for
personal details before confirming publication.

Create the official Bluesky account, then create a dedicated app password in
that account's **Settings → Privacy and Security → App Passwords**. Configure
these values only in the backend environment (local `backend/.env` or the
backend hosting provider's secret settings):

- `BLUESKY_IDENTIFIER`: the official account handle or DID.
- `BLUESKY_APP_PASSWORD`: the dedicated app password, not the account password.

The backend connects to `https://bsky.social`. Never place these values in
frontend `.env` files or `EXPO_PUBLIC_*` variables. For local development, set
both values and restart the backend. In production, either set both variables
or leave both unset; the publishing route reports a safe configuration error
when the optional integration is unavailable.

For protocol and SDK details, see Bluesky's [create-a-post tutorial](https://docs.bsky.app/docs/tutorials/creating-a-post),
[post and embed guide](https://docs.bsky.app/docs/advanced-guides/posts), and
the official [`@atproto/api` package](https://github.com/bluesky-social/atproto/tree/main/packages/api).

Apply `supabase/migrations/015_bluesky_publications.sql` through the reviewed
Supabase migration workflow before enabling publishing. It creates a private,
service-role-only table with a unique report ID to serialize publication and
store the confirmed post URI and URL. If a request times out after post
creation begins, the report is marked uncertain and is not automatically
retried; check the official account before taking further action. This
repository change does not apply the migration or deploy the backend.

The authenticated `GET /api/social/bluesky/status?issue_id=<report-id>` endpoint
returns only whether the official credentials are present, whether migration
015 is reachable, and whether the authenticated owner’s report is eligible (or
already published). It never returns credential values or pretends the account
was live-authenticated; provider credentials are actually checked at publish
time. Public post text is truncated to the protocol limit and common patterns
for email addresses, phone numbers, street addresses, coordinates, and URLs are
redacted as an extra safeguard. Review the final preview because automatic
redaction cannot identify every sensitive detail.

The backend requires Node.js 22 or newer. Source images must be JPEG, PNG, or
WebP and at most 10 MB (the existing Civic Vigilance upload limit). The backend
re-encodes images to fit Bluesky's 2 MB image-embed limit. Bluesky's service and account limits apply;
publishing is not unlimited and availability is not guaranteed. The automated
tests mock all Bluesky and Supabase interactions and never publish a real post.

## X account linking

The authenticated endpoints `POST /api/x/connect`, `GET /api/x/connection`,
and `DELETE /api/x/connection` use OAuth 2.0 Authorization Code with PKCE.
X redirects to `GET /api/x/connect/callback`. The callback exchanges the code
server-side, verifies the account with `GET https://api.x.com/2/users/me`, and
stores only the returned X identity plus application-encrypted tokens. It does
not publish posts or revoke the X grant on disconnect.

Configure `X_CLIENT_ID`, `X_CLIENT_TYPE`, `X_CLIENT_SECRET` (confidential
clients only), `X_OAUTH_CALLBACK_URL`, `X_OAUTH_APP_RETURN_URL`,
`X_TOKEN_ACTIVE_KEY_ID`, and `X_TOKEN_ENCRYPTION_KEYS_JSON` only in the backend
host environment. Never use an `EXPO_PUBLIC_*` variable for X credentials or
encryption keys. The keyring JSON maps key IDs to base64-encoded 32-byte AES
keys; preserve old key IDs during rotation until ciphertext is re-encrypted.

Migration `013_user_x_connections.sql` stores the private connection. Migration
`014_x_oauth_attempts_and_refresh_lock.sql` provides durable one-time OAuth
state and cross-instance refresh locking. Both tables deny client-role access;
the code requires the server-side `service_role` grant. Apply migration 014
through the reviewed database migration workflow before enabling these
endpoints. This repository change does not apply migrations or configure X.

Register the exact backend `X_OAUTH_CALLBACK_URL` in the X Developer Portal.
For local development use a controlled HTTPS tunnel and register that exact
URL; do not substitute the native app return URI for the backend callback.
`X_OAUTH_APP_RETURN_URL` is a separate return target and must be either the
native `civicvigilance://oauth/twitter` URI or an HTTPS origin allowed by
`ALLOWED_ORIGIN`. Do not enable the integration until the X app type, required
OAuth scopes, account access, billing, and callback configuration are confirmed.

## Optional AI report-writing assistance

`GET /api/report-ai/capabilities` reports whether the authenticated photo-based
drafting flow is configured. If unavailable, its response lists only missing
or invalid environment-variable names, never their values.

`POST /api/generate-report-content` is authenticated and rate-limited. After
explicit `privacy_notice_accepted: true`, it sends the report photo to the
configured vision provider and then sends that structured analysis with the
user-entered title, category, and description to the text provider. Address and
coordinates are not sent. The source photo must be in the authenticated user's
private Supabase Storage folder; the backend signs it briefly and validates
its content type and size before calling the provider.

For Groq, create an API key in GroqCloud and set the backend-only
`GROQ_API_KEY` environment variable. The adapter uses
`https://api.groq.com/openai/v1/chat/completions` with
`qwen/qwen3.8-27b` for photo analysis and report drafting. Groq's official
model catalog and vision documentation list 3.8 as an active multimodal
production model with JSON mode. Groq's deprecation notice says
`qwen/qwen3.6-27b` shut down on September 14, 2026 and names 3.8 as its direct
replacement, so the retired 3.6 model is not configured.
See Groq's [model catalog](https://console.groq.com/docs/models),
[vision guide](https://console.groq.com/docs/vision), and
[deprecation notice](https://console.groq.com/docs/deprecations).

The backend downloads the short-lived Supabase-signed private image, enforces
the existing image constraints, encodes it as a `data:image/...;base64,...`
image URL in a multimodal chat message, requests JSON mode, parses the
completion, and validates it against Civic Vigilance's existing output
contracts. One key powers both operations; it is never sent to the frontend.

Setup:

1. Add `GROQ_API_KEY` to the backend process environment and set its value to
   your GroqCloud API key. For local development, use the
   backend's local environment file without committing it; for hosting, use
   the platform's server-side environment-variable settings.
2. Keep the existing Supabase backend variables configured, including the
   server secret/service-role key needed to sign private photos.
3. Restart the backend. `AI_VISION_ENDPOINT`, `AI_VISION_API_KEY`,
   `AI_TEXT_ENDPOINT`, and `AI_TEXT_API_KEY` are not needed when
   `GROQ_API_KEY` is configured.

Groq's published free-plan limits for `qwen/qwen3.8-27b` are 30 requests per
minute, 1,000 requests per day, 8,000 tokens per minute, and 200,000 tokens
per day. Limits apply at the organization level and can change; check the
GroqCloud [rate limits page](https://console.groq.com/docs/rate-limits) for the
account's current quota. This backend
configuration does not enable or require a paid plan. Requests include the
report photo and user-provided report details, so review Groq's current data
and retention policies and obtain user permission before sending evidence.

If generation fails, the app now distinguishes common upstream failures:
invalid key/model access, malformed JSON-mode requests, quota limits, and
temporary Groq or private-storage availability problems. Confirm that the app
is calling a restarted backend with the Groq adapter version; backend changes
do not affect an already deployed API until it is redeployed.

Existing custom providers remain supported when `GROQ_API_KEY` is unset:

- `AI_VISION_ENDPOINT` and `AI_VISION_API_KEY`: an HTTPS endpoint accepting
  `{ image_url, categories, instructions, response_fields }` and returning
  the six validated analysis fields directly as JSON.
- `AI_TEXT_ENDPOINT` and `AI_TEXT_API_KEY`: an HTTPS endpoint accepting
  `{ task, report, image_analysis, instructions, response_schema }` and
  returning the requested report-content JSON object directly.

AI photo assistance also requires `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) on the backend for
private photo signing. Restart the backend after changing its environment.
Never place provider credentials in frontend `.env` files or `EXPO_PUBLIC_`
variables.

On successful generation the app fills the current title and description with
the result; those fields remain editable and should be reviewed before report
submission. Category suggestions remain opt-in, and summaries, captions, and
hashtags remain separate drafts.

Authority account suggestions are read from the Supabase `public.authorities`
directory and matched against the issue category and a reported city or GPS
geohash. A handle is suggested only when the row is active, its directory
verification status is `verified`, and its Twitter/X handle is marked verified
and active in `social_media`. The frontend validates links and labels the
result as a verified directory suggestion; users must review it, and the app
does not contact or tag accounts automatically. Department-level suggestions
are generic guidance, not verified contacts. The local seed data is not proof
that a Supabase project contains eligible verified authority rows.

## Testing

To run the tests, use the following command:
```
npm test
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.
