# Civic Vigilance Test Report

Date: 2026-10-17

## Automated results

| Check | Result | Evidence |
|---|---|---|
| Frontend TypeScript | Passed | `tsc --noEmit`, zero errors |
| Frontend Jest | Passed | 4 suites, 8 tests |
| Backend Jest | Passed | 1 suite, 4 tests |
| Production web export | Passed | 1,249 modules bundled; exit code 0 |
| Expo Doctor | Warning | 17/18 checks passed; native folders mean selected `app.json` fields are not automatically synchronized by EAS |

Frontend tests cover existing UI helpers/components plus invalid/missing coordinates, absence of a fabricated fallback, evidence count and placeholder rejection, and factual complaint drafting. Backend tests cover API health, required AI privacy acknowledgement, valid AI structured output and invalid category/confidence rejection.

## Verified by code/build inspection

- No placeholder image is substituted by the real camera flow.
- Camera capture cannot proceed twice concurrently and cannot exceed three photos.
- Gallery cancellation does not add evidence.
- Missing GPS remains null and manual address confirmation is available.
- Invalid coordinate ranges are rejected.
- Upload failure is propagated; it is not converted into success or a public local URI.
- Duplicate submission/upload defenses use a UI lock, client request UUID, deterministic object name and database unique index.
- X/Twitter compose success is not labelled as published.
- AI credentials are server-only and output is schema validated.

## Not executed

The following tests require resources unavailable in this workspace and are not claimed as passed:

- Physical Android/iOS camera output, orientation, flash/device switching and OS permission recovery.
- Browser permission interaction with actual camera hardware.
- Live GPS unavailable/inaccurate/stale scenarios and embedded map-pin selection.
- Live Supabase upload, database failure recovery, RLS denial, private-photo access and migration execution.
- Durable offline synchronization and network interruption during upload.
- Live AI valid/invalid/timeout/rate-limit behavior against a configured provider.
- Authority jurisdiction correctness against verified official source data.
- External complaint submission, X/Twitter publication IDs, reminder delivery and authoritative status retrieval.
- Resolution-evidence UI and citizen confirmation end to end.

## Known warnings and blockers

- Expo Doctor reports one expected configuration warning because the repository contains a checked-in Android project and also uses native `app.json` configuration. Native changes must be synchronized deliberately (for example through an intentional prebuild/native update workflow).
- The evidence bucket defined by current migrations is public. Private report rows are protected, but private-photo confidentiality requires a private bucket and signed-URL retrieval before production release.
- Migration 002 contains broad system-update policies for derived metrics. These should be replaced with trusted `SECURITY DEFINER` functions or server-side operations before production.
- There is no configured lint script, so lint was not run.

## Reproduction

```powershell
cd frontend
npm run typecheck
npm test -- --runInBand
npx expo export --platform web --output-dir .audit-web-build
npx expo-doctor

cd ..\backend
npm test -- --runInBand
```

