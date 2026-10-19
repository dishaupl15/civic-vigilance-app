# Civic Vigilance Implementation Report

Date: 2026-10-17

## Outcome

The existing Expo/React Native, TypeScript, Express and Supabase stack was retained. The implementation focused on correcting unsafe reporting behavior rather than rebuilding the application.

## What existed before

- A five-stage reporting UI using Expo Camera, gallery selection, foreground location, Supabase Storage and deep-link sharing.
- Image optimization, geohash helpers, static authority seed data, local SQLite support, Supabase authentication/RLS migrations and X/Twitter edge functions.
- Feed, profile, notifications/preferences, comments/votes and basic tests.
- Many features were present only as demo data or had conflicting schemas and optimistic success behavior.

## Changes made

- Removed the hard-coded Mumbai coordinate fallback. Missing GPS is represented as missing and users can confirm a manual address with optional validated coordinates.
- Changed camera and location permissions to explicit report-workflow actions. Added capture locking, duplicate URI prevention, browser capability messages and clearer simulator behavior.
- Made description, evidence and confirmed location mandatory before submission.
- Added recoverable draft persistence and a stable client request UUID.
- Changed storage failures to fail visibly instead of returning a local URI. Added MIME/size checks, compression-on-need, concurrency limit, deterministic upload names, HTTPS URL validation and temporary-file cleanup.
- Standardized active client report reads/writes on `issues` and added full schema payload fields.
- Removed the invented `@mygovindia` fallback. Authority matches expose confidence, rationale, source URL when available and `seed` verification status.
- Corrected sharing language: opening a compose screen is not confirmed publication.
- Changed the no-share choice into a genuinely private report row at the database-policy level.
- Added a factual complaint-draft helper.
- Added an optional server-mediated AI analysis gateway with consent, input checks, rate limiting, timeout handling and strict structured-output validation. AI remains optional and unconfigured by default.
- Added migration 008 for idempotency, location provenance, visibility, authority provenance, timeline events, reminders and resolution evidence.
- Removed unnecessary Android audio, storage and foreground-location-service permissions.

## Intentionally unchanged

- React Native, Expo, TypeScript, Supabase, existing navigation and visual design.
- Existing X/Twitter edge functions. They require external credentials and were not deployed or claimed as verified.
- Demo/guest feed records remain for explicitly identified guest/demo paths; they are never substituted for captured evidence.
- Legacy database schema files remain for historical reference. The migrations directory is the recommended path.

## Modified and added files

- Reporting UI: `frontend/screens/ReportIssueScreenV2.tsx`, `frontend/screens/reporting/Stage1CameraScreen.tsx`, `Stage2DetailsScreen.tsx`, `Stage3PrivacyScreen.tsx`, `Stage4PreviewScreen.tsx`, `Stage5SuccessScreen.tsx`.
- Client services: `frontend/hooks/useLiveLocation.ts`, `frontend/hooks/useIssues.ts`, `frontend/lib/storage.ts`, `frontend/lib/smartAuthorities.ts`, `frontend/lib/reportDrafts.ts`, `frontend/lib/reportValidation.ts`, `frontend/lib/complaintDraft.ts`, `frontend/lib/aiAnalysis.ts`, `frontend/lib/followUp.ts`.
- Backend: `backend/src/app.js`, `backend/src/index.js`, `backend/src/routes/index.js`, `backend/src/ai-analysis.js`, `backend/test/index.test.js`.
- Database/config: `backend/supabase/migrations/008_reporting_reliability.sql`, both `.env.example` files, local ignored `.env` files, `frontend/app.json`, and the Android manifest.
- Tests/docs: `frontend/__tests__/reportingReliability.test.ts` and the three implementation reports.

## Environment variables

Frontend (public/client-safe):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_BACKEND_MODE`
- `EXPO_PUBLIC_AUTO_GUEST`
- `EXPO_PUBLIC_NODE_API_URL`
- `EXPO_PUBLIC_STORAGE_BUCKET`
- Existing public app, Maps and OAuth client identifiers listed in `frontend/.env.example`

Backend (server-only):

- `PORT`, `ALLOWED_ORIGIN`
- Supabase server values listed in `backend/.env.example`
- Existing Twitter credentials
- Optional `AI_VISION_ENDPOINT` and `AI_VISION_API_KEY`

Never place the AI key, service-role key, OAuth client secret or access-token secrets in an `EXPO_PUBLIC_*` value.

## Setup and run commands

```powershell
cd backend
npm ci
npm start
```

```powershell
cd frontend
npm ci
npm start -- --web
```

Apply migrations 001 through 008 to a staging Supabase project in order before testing submissions. Ensure the `issue-photos` bucket and policies exist.

## Verification commands

```powershell
cd frontend
npm run typecheck
npm test -- --runInBand
npx expo export --platform web --output-dir .audit-web-build
npx expo-doctor
```

```powershell
cd backend
npm test -- --runInBand
```

## Performance measurement

The post-change production web export contained 1,249 modules, 2,852,147 bytes of JavaScript and 7,108,850 total bytes across 27 files. No comparable pre-change byte measurement was captured, so no improvement percentage is asserted. Image compression/upload timings are emitted only in development and need real-device measurements with representative photos.

## External blockers

- Physical Android/iOS hardware is required to verify native camera output, orientation, flash, permission recovery and GPS accuracy.
- A staging Supabase project is required to apply migration 008 and verify RLS, storage and idempotency end to end.
- An AI gateway and credentials are required to verify model quality, rate-limit behavior and provider response compatibility.
- Authority contacts need official-source research and periodic re-verification.
- X/Twitter and complaint portal outcomes need authorized accounts/APIs. A compose deep link alone cannot prove publication.

