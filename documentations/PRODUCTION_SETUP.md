# Civic Vigilance production setup

The repository-side production controls are implemented. Values marked **required from owner** must be supplied by the project owner and must not be committed.

## 1. Credential map

| Variable | File / host | Required | Obtain from |
|---|---|---:|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `frontend/.env`, EAS | Yes | Supabase project Connect page |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `frontend/.env`, EAS | Yes | Supabase publishable/anon key |
| `EXPO_PUBLIC_NODE_API_URL` | `frontend/.env`, EAS | Yes | Deployed Node API URL ending in `/api` |
| `EXPO_PUBLIC_API_URL` | `frontend/.env`, EAS | Yes | `https://PROJECT_REF.supabase.co/functions/v1` |
| `SUPABASE_URL` | `backend/.env`, backend host | Yes | Supabase project Connect page |
| `SUPABASE_PUBLISHABLE_KEY` | `backend/.env`, backend host | Yes | Supabase publishable key (`SUPABASE_ANON_KEY` is supported for legacy projects) |
| `SUPABASE_SECRET_KEY` | backend host only | Yes | Supabase secret key (`SUPABASE_SERVICE_ROLE_KEY` is supported for legacy projects) |
| `ALLOWED_ORIGIN` | backend host | Yes | Exact deployed frontend HTTPS origin |
| Google Maps public key | frontend/EAS | Optional | Google Cloud Console; restrict by app/domain |
| AI endpoint and key | backend host only | Optional | Selected AI gateway/provider |

Never expose `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, database passwords, access tokens, or AI keys through an `EXPO_PUBLIC_*` variable.

The current X sharing flow opens the user's composer. Server-side X OAuth and direct posting are retired, so no X API credentials are required or stored.

## 2. Database deployment

From `backend`:

```powershell
npx --yes supabase@2.121.0 login
npx --yes supabase@2.121.0 link --project-ref YOUR_PROJECT_REF
npm run db:push:dry
npm run db:push
npx --yes supabase@2.121.0 migration list
```

Do not run `db reset --linked` against staging or production. Do not include seed data in production.

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

Deploy `backend/Dockerfile` or run `npm ci --omit=dev` followed by `npm start`. Configure environment variables in the hosting dashboard, not in the image. The health endpoint is `/api/health`.

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
