# Civic Vigilance production setup

The repository-side production controls are implemented. Values marked **required from owner** must be supplied by the project owner and must not be committed.

## 1. Credential map

| Variable | File / host | Required | Obtain from |
|---|---|---:|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `frontend/.env`, EAS | Yes | Supabase project Connect page |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `frontend/.env`, EAS | Yes | Supabase publishable/anon key |
| `EXPO_PUBLIC_BACKEND_MODE=supabase` | `frontend/.env`, EAS | Yes | Fixed application mode |
| `EXPO_PUBLIC_STORAGE_BUCKET` | `frontend/.env`, EAS | Yes | Existing public image bucket name |
| `EXPO_PUBLIC_PRIVATE_STORAGE_BUCKET` | `frontend/.env`, EAS | Yes | Existing private evidence bucket name |
| `EXPO_PUBLIC_NODE_API_URL` | `frontend/.env`, EAS | Yes | Deployed Node API base ending in `/api`; HTTPS in production |
| `EXPO_PUBLIC_API_URL` | `frontend/.env`, EAS | Yes | `https://PROJECT_REF.supabase.co/functions/v1` |
| `SUPABASE_URL` | `backend/.env`, backend host | Yes | Supabase project Connect page |
| `SUPABASE_PUBLISHABLE_KEY` | `backend/.env`, backend host | Yes | Supabase publishable key (`SUPABASE_ANON_KEY` is supported for legacy projects) |
| `SUPABASE_SECRET_KEY` | backend host only | Yes | Supabase secret key (`SUPABASE_SERVICE_ROLE_KEY` is supported for legacy projects) |
| `ALLOWED_ORIGIN` | backend host | Yes | Exact deployed frontend HTTPS origin |
| `PORT` | backend host | Optional | Defaults to `3000` |
| `NODE_ENV=production` | backend host | Deployment | Set by production host |
| Google Maps public key | frontend/EAS | Optional | Google Cloud Console; restrict by app/domain |
| `AI_TEXT_ENDPOINT` / `AI_TEXT_API_KEY` | backend host only | Optional for report drafts | Selected HTTPS-compatible AI gateway/provider |
| `AI_VISION_ENDPOINT` / `AI_VISION_API_KEY` | backend host only | Optional for image analysis | Selected HTTPS-compatible vision provider |
| `X_CLIENT_ID` / `X_CLIENT_TYPE` | backend host only | Optional for account linking | X Developer Portal; client type must be `public` or `confidential` |
| `X_CLIENT_SECRET` | backend host only | Confidential X client only | X Developer Portal |
| `X_OAUTH_CALLBACK_URL` | backend host only | Optional for account linking | Exact HTTPS callback registered with X |
| `X_OAUTH_APP_RETURN_URL` | backend host only | Optional for account linking | `civicvigilance://oauth/twitter` or allowed HTTPS frontend origin |
| `X_TOKEN_ACTIVE_KEY_ID` / `X_TOKEN_ENCRYPTION_KEYS_JSON` | backend host only | Optional for account linking | Separately managed AES-256 keyring; never database or frontend |

Never expose `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, database passwords, access tokens, or AI keys through an `EXPO_PUBLIC_*` variable.

## 1.1 Android release builds and EAS environments

The `preview` and `production` EAS profiles use separate EAS environments; a
local `frontend/.env` is not a substitute for configuring those environments
on the Expo project. Set the public variables from the credential map in both
EAS environments. `EXPO_PUBLIC_NODE_API_URL` must use the separate deployed
backend's public URL ending in `/api`, not the production web app origin.
Keep backend-only secrets out of Expo/EAS frontend variables. The build
pre-install hook validates HTTPS URLs, rejects localhost and private local
hosts, requires the Functions URL to target the same Supabase project, and
rejects service-role keys.

Both Android release profiles produce installable APKs. Run the local checks
from `frontend` before building:

```powershell
npm run typecheck
npm test -- --runInBand
npm run check:env
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform android --profile production
```

Before release, verify the exact EAS environment the APK will use without
printing its variable values:

```powershell
npx eas-cli@latest env:exec preview "node scripts/check-supabase-schema.js" --non-interactive
npx eas-cli@latest env:exec production "node scripts/check-supabase-schema.js" --non-interactive
```

The schema check performs zero-row PostgREST selects against the report,
engagement, profile, notification, and owner-scoped report tables. It does not
read report data or write to the database. It also verifies the Node API health
response, checks the frontend-used Node API routes with their expected HTTP
methods, confirms protected routes require authentication, and verifies the
public OAuth callback is routed to the application. A health-only success is
not sufficient to approve the configured API endpoint.

The Android application ID remains `com.anonymous.civicvigilance` to preserve
updates to existing Android installations. Production APKs are for direct
installation/distribution. Google Play submissions generally require an
Android App Bundle (AAB), so use a separate store build profile if Play Store
submission is needed.

X sharing opens the user's composer. Direct post publishing is not implemented.
X account linking is available only after the server-side OAuth configuration
below is complete.

X account linking requires X OAuth 2.0 Authorization Code with PKCE configured
in the Developer Portal. Verify the app/client type, `users.read`,
`tweet.read`, and `offline.access` support, callback URL, and account/API
eligibility manually. Do not request `tweet.write`; post publishing is not part
of this integration. X pricing and access can change and are not established
by the application configuration.

The backend callback URL and app return URL are different: register the HTTPS
backend callback exactly with X, then set a separate app return URL. Local
testing requires an exact registered HTTPS callback, such as a controlled
tunnel; do not assume a production backend domain. The callback necessarily
receives X's one-time authorization code in its inbound query string. Configure
the hosting proxy/access logs to redact callback query strings. The app
redirect receives only a generic connection result, never the code or tokens.

The existing connection schema is migration 013. Migration 014 adds persistent,
single-use OAuth state and an atomic refresh lock. Review and apply migration
014 before enabling OAuth routes; do not apply it as part of frontend/backend
deployment. Keep the encryption keyring only in the backend secret manager.

## 2. Database deployment

From `backend`, after confirming the intended project in the Supabase Dashboard:

```powershell
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref YOUR_PROJECT_REF
npx --yes supabase@2.121.0 migration list --linked
npm run db:push:dry
```

`migration list --linked` reads the remote migration ledger. Compare it with
the local files before proceeding. The dry run may include **every** local
migration that is absent remotely, not just migrations 011 and 012. Inspect
that exact plan and reconcile it with the remote schema and the preflight
queries in `SUPABASE_SETUP.md`. In particular, 011 depends on the existing
`issues`, `authorities`, and `issue_category` schema plus authority verification
columns from 008; 012 assumes `public.issues.address` exists. The numbering
also means any earlier pending migration, including 010, may be included.

Do not use the legacy interactive `backend/apply-migrations.sh` script for
production deployment: its hard-coded migration lists stop at 006 and its
per-file `db push --include` loop does not represent the current migration
sequence. Do not run `db reset --linked`, apply SQL manually while skipping
migration bookkeeping, or run `npm run db:push` until the full dry-run plan,
preflight, backup, and change approval are complete. After approval, use the
reviewed linked CLI workflow and verify migration history and catalog state
again. Never use `migration repair` to mark SQL as applied unless the actual
remote schema has been reconciled and the database owner approves it.

After approval, if the dry-run output contains only the reviewed migrations
and the project's backup/change controls are complete, apply with
`npm run db:push`, then verify with
`npx --yes supabase@2.121.0 migration list --linked`. The push applies every
pending local migration, so do not use it when unrelated migrations remain in
the plan.

Migration 011 adds `issue_authority_suggestions` and
`issue_generated_content`, owner-scoped RLS, owner/report foreign keys, and
uniqueness/index constraints. It does not add triggers. Migration 012 adds
`issues_address_length` as `NOT VALID`: applying it does not scan/reject
existing long addresses, but all new rows and updates must satisfy the
constraint. Existing rows over 300 characters remain readable, but even an
unrelated update to such a row may fail until its address is corrected.

Do not run `db reset --linked` against staging or production. Do not include seed data in production.
Verify the applied migration history includes `009_production_hardening.sql`: it creates the auth-user trigger that idempotently creates `public.users`, `public.profiles`, `public.user_stats`, and `public.user_preferences`, and backfills existing auth users. The frontend may create/update only the caller's `public.profiles` row; it must not create `public.users` because that table is protected by RLS and is required as the issue owner foreign key. Do not apply this migration to production without reviewing it and following the project's database change approval process.

## 3. Supabase dashboard settings

- Authentication: keep email/password enabled. To allow immediate email/password signup, disable email confirmation (the dashboard may label this “Confirm email”). This allows accounts with unverified email addresses. Signup is sent directly from the frontend to Supabase Auth; the Node backend and its `.env` do not control confirmation.
- Authentication URL Configuration:
  - Site URL: `https://civic-vigilance-app.vercel.app`
  - Allowed Redirect URLs: `https://civic-vigilance-app.vercel.app/`, `http://localhost:8081/`, and `civicvigilance://auth/callback`.
  - The frontend's `web` script uses Expo's default web port (`8081`). If Expo reports a different local port, add that exact local origin rather than a broad wildcard.
- Authentication email templates: if confirmation is enabled in the future, keep the confirmation link as `{{ .ConfirmationURL }}` so Supabase can complete its token/PKCE flow and apply the redirect URL requested by the app. Do not replace it with a direct `{{ .SiteURL }}` link.
- Authentication email delivery: configure a custom SMTP provider under Authentication → Emails → SMTP Settings, use a verified sender domain, and publish the provider's SPF, DKIM, and DMARC records. Keep SMTP credentials only in Supabase's dashboard. The built-in sender is rate-limited and is not a reliable production mail service.
- Email troubleshooting: after requesting signup or resend, inspect the Supabase project's Auth logs and the SMTP provider's delivery/bounce logs. An accepted signup/resend response means only that Supabase accepted the request; it does not prove that the recipient received an email.
- Vercel frontend environment: set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the intended project and `EXPO_PUBLIC_BACKEND_MODE=supabase` for Production. These are frontend values; never set a service-role/secret key as an `EXPO_PUBLIC_*` variable. Redeploy the frontend after changing Vercel environment variables.
- Authentication protection: configure CAPTCHA and appropriate Auth rate limits.
- Database: run Security Advisor and confirm RLS is enabled on every exposed table.
- Storage: verify `issue-photos` is public and `private-issue-photos` is private.
- Database settings: enable SSL enforcement; restrict direct database network access where practical.
- Organization: enable MFA for every administrator.
- Backups: choose retention/PITR appropriate for the recovery objective.

## 4. Backend deployment

The backend can be deployed as a separate Vercel project from the same
repository by setting its Root Directory to `backend`; the Vercel Function
entry point is `backend/api/[...path].js`. This keeps an existing frontend
Vercel project unchanged. Alternatively, deploy `backend/Dockerfile` or run
`npm ci --omit=dev` followed by `npm start` on a Node host. Configure
environment variables in the hosting dashboard, not in the image. The health
endpoint is `/api/health`.

Before deployment:

```powershell
npm test -- --runInBand
npm run check:env
```

## 5. Frontend deployment

Create EAS `production` environment variables using the values from `frontend/.env.example`. Public Supabase keys are expected in a client app; secret/service-role keys are prohibited.

```powershell
npm ci
npm run verify:production
npx eas-cli build --platform android --profile production
npx eas-cli build --platform ios --profile production
```

For web, run `npx expo export --platform web` and deploy the output behind HTTPS.

## 6. Mandatory acceptance tests

- Use a non-production Supabase project with two test users and the reviewed
  migrations applied. Keep test records private to the test project.
- Submit a report with a manually entered address and no coordinates. Confirm
  the saved `issues.address`, null `location`, `location_source='manual'`, and
  authenticated `user_id`; revisit/reload the report and verify the same
  address is displayed.
- With device location permission granted, explicitly request a one-time GPS
  fix, confirm the displayed address/coordinates, submit, and revisit the
  report. Confirm the saved PostGIS point, geohash, accuracy, source, and
  address match the confirmed values.
- Deny location permission and disable device location services in separate
  runs. Confirm manual address submission remains possible and no coordinates
  are fabricated. Try one coordinate only, out-of-range coordinates, and an
  address over 300 characters; confirm each invalid report is blocked.
- Seed a test authority row with category/jurisdiction match, active status,
  `verification_status='verified'`, and a verified active public handle.
  Generate suggestions, review/select one, submit, then reopen the report.
  Confirm `issue_authority_suggestions` contains the report/owner/authority
  relationship, selected flag, verified status, and timestamp, and suggestions
  reload. Confirm unverified/inactive/mismatched accounts are withheld.
- Configure the approved HTTPS text-provider endpoint and key only on the
  backend test deployment. Accept the privacy notice, generate report drafts,
  and confirm the provider receives only title/category/description. Submit,
  reload, and verify each draft in `issue_generated_content`; regenerate and
  verify earlier generations remain. Confirm missing configuration, provider
  errors, invalid provider output, and retries are surfaced without losing
  manual reporting.
- Authenticate as test user B and attempt to read and insert rows linked to
  user A's issue in both assistance tables. Reads must return no rows and
  writes must be denied by RLS. Also attempt to save a suggestion with a
  non-verified authority or mismatched owner/category; writes must fail.
- Test duplicate submission and repeated save with the same generation ID;
  no duplicate rows or replacement of earlier drafts should occur.

- Email signup, confirmation, login, logout, and password reset.
- Camera capture, gallery selection, permission denial, and location confirmation.
- Public report creation and public photo display.
- Private report creation and signed private-photo access only by the owner.
- Duplicate submission idempotency.
- Cross-account RLS attempts for reports, profiles, notifications, votes, and private files.
- Data export and permanent account deletion.
- AI disabled-state behavior if its endpoint and key are not configured.
- X composer opening, text population, cancellation, and successful user posting.
- Android, iOS, and web production builds without development credentials.
