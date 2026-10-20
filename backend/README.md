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

`POST /api/generate-report-content` is an authenticated, rate-limited endpoint.
It requires explicit `privacy_notice_accepted: true` and sends only the
user-entered title, category, and description to the configured text provider.
The app does not send report photos, address, or coordinates for this feature.
The user must review generated drafts and explicitly apply any title,
description, or category change; summaries, captions, and hashtags remain
separate drafts.

The optional server-only `AI_TEXT_ENDPOINT` and `AI_TEXT_API_KEY` variables
must be configured together. The HTTPS provider endpoint must accept the JSON
request shape in `src/report-content.js` and return the requested JSON object
directly. No provider is bundled or assumed. If either variable is absent, the
endpoint reports that AI assistance is unavailable and normal report
submission remains available. Never place these credentials in the frontend
or in an `EXPO_PUBLIC_` variable.

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
