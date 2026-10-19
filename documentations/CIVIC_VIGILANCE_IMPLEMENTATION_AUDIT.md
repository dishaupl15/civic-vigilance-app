# Civic Vigilance Implementation Audit

Date: 2026-10-17

## Scope and evidence

This audit covers the Expo application, Express API, Supabase migrations and edge functions, local SQLite implementation, authentication, report flow, camera, foreground location, image processing, storage, authority routing, sharing, notifications, tests, deployment configuration, and existing project documentation. Runtime claims below are limited to checks actually performed. No physical Android/iOS device, live Supabase project, AI provider, X/Twitter account, or government complaint portal was available during this audit.

Status terms are: **Implemented and verified**, **Implemented but not verified**, **Partially implemented**, **Mocked or demonstration-only**, **Missing**, and **Blocked by external credentials or platform restrictions**.

## Requirement status

| Area | Status | Evidence and gap |
|---|---|---|
| Repository separation and environment files | Implemented and verified | Frontend and backend are separated. Private `.env` files are ignored; examples list client-safe and server-only values. |
| Native camera capture | Implemented but not verified | `Stage1CameraScreen.tsx` uses `CameraView.takePictureAsync`; physical-device verification remains required. |
| Browser camera | Implemented and verified at build level | Explicit user-triggered permission, secure-context and API checks, mount errors, gallery fallback. Browser hardware capture still requires interactive testing. |
| Placeholder substitution in capture flow | Implemented and verified | No placeholder or remote sample is used when capture fails. Missing evidence blocks continuation. Demo feed seed data remains clearly separate from capture. |
| Camera denial, cancellation, failure, switching, flash | Partially implemented | Denial, permanently blocked state, gallery cancellation, mount/capture errors, front/rear switching and native flash exist. Device capability-specific flash verification is outstanding. |
| Photo preview/removal/maximum three/duplicate tap | Implemented and verified at unit/build level | Preview and removal exist; capture is locked while active; list is capped at three. Native orientation/readability needs device QA. |
| Permission timing and resource release | Implemented and verified by inspection | Camera and foreground location are requested only from report actions. Camera unmounts when leaving Stage 1; location subscription cleanup is registered. |
| GPS coordinates and accuracy | Implemented but not verified | Valid coordinates, accuracy and timestamp are retained. Physical GPS testing remains outstanding. |
| Fabricated location fallback | Implemented and verified | Hard-coded Mumbai fallback was removed. Missing coordinates remain `null`. |
| Manual location and confirmation | Partially implemented | Manual address and optional validated coordinates are supported and explicitly confirmed. A detected pin opens in the external map; an embedded draggable map pin is not implemented. |
| Stale/inaccurate GPS handling | Partially implemented | Accuracy is displayed and poor accuracy is warned. Capture timestamp is stored in hook state, but a strict maximum-age submission rule is not yet enforced. |
| Background location avoidance | Implemented and verified by configuration | Foreground-only APIs are used; foreground-service permissions/configuration were removed. |
| Image compression | Implemented and verified at build level | Images over the size threshold are resized/compressed. Development logs record optimized size and duration without location/user data. Real-photo measurements need devices. |
| Upload validation and retry | Implemented but not verified against live storage | Image MIME and 10 MB limit, exponential retry, two-upload concurrency, HTTPS result validation, deterministic retry paths, and temp cleanup exist. |
| Upload/database failure recovery | Partially implemented | Failures are shown and the local report draft is retained. Uploaded orphan cleanup after a later database failure is not implemented. |
| Duplicate submission/upload prevention | Implemented but not verified against live Supabase | UI submission lock, per-draft UUID, database uniqueness, and deterministic storage names exist. Migration 008 must be applied. |
| Offline reporting | Partially implemented | SQLite/local data paths exist; web uses an in-memory database. A durable native sync worker and conflict/retry state machine are not complete. |
| Structured AI analysis | Implemented but not verified | Optional backend gateway validates six required fields, requires explicit privacy acknowledgement, limits requests and times out. No provider is configured and the UI does not automatically invoke it. Manual reporting remains available. |
| AI safety constraints | Implemented and verified by unit tests/inspection | Provider instructions prohibit location, responsibility and unsupported causal/legal inferences; output category/confidence/review fields are validated. Provider compliance cannot be guaranteed without evaluation data. |
| Authority directory provenance | Partially implemented | Routing now returns confidence, rationale, source URL when present, and `seed` verification status. Existing contact records lack per-claim sources and verified dates. |
| Authority routing | Partially implemented | Category plus address/geohash hierarchy exists and missing coordinates are explicit. Road ownership and jurisdiction exceptions are not sufficiently modelled. No fallback handle is silently invented. |
| Complaint drafting | Implemented and verified by unit test | A factual draft service uses category, description, confirmed location, observation time, attachments, proposed authority and optional report ID. |
| Citizen review | Partially implemented | Stage 4 reviews photos, text, location, privacy and suggested recipients. Authority editing, image redaction and complaint-text editing are not complete. |
| External sharing truthfulness | Implemented and verified by inspection | Opening an X compose URL is recorded only as “composer opened”; the success screen does not claim publication. No post ID is fabricated. |
| Direct official complaint integrations | Missing | No verified portal API is integrated. Existing links/deep links are user-driven fallbacks. |
| Timeline and lifecycle data model | Implemented but not verified | Migration 008 adds sourced events, reminders and resolution evidence. Frontend helper supports citizen events and reminder scheduling/cancellation. Full timeline UI is missing. |
| Official status tracking | Missing | No authoritative status API is configured. The schema distinguishes citizen, official and authoritative-API sources so replies cannot imply resolution. |
| Notifications | Partially implemented | Preference UI exists; platform scheduling/delivery and duplicate-notification suppression are not implemented. |
| Authentication | Implemented and previously exercised | Supabase and local authentication paths exist. Live production authentication was not re-tested in this audit. |
| RLS and private reports | Partially implemented | Migration 008 limits private issue rows to owners through the existing owner policy and public visibility policy. The current public evidence bucket means private-photo confidentiality is not complete. |
| Storage ownership | Partially implemented | Paths begin with authenticated user ID and update/delete policies check ownership. The bucket remains public. |
| Trusted-boundary validation/rate limits | Partially implemented | AI requests are size-limited, validated and rate-limited. Direct Supabase writes rely on constraints/RLS; broad metric-update policies in migration 002 require hardening. |
| Secrets | Implemented and verified by repository inspection | AI/provider and service-role secrets are server-only. No new private key is in `EXPO_PUBLIC_*`. Private env files are gitignored. |
| Feed pagination | Partially implemented | Queries use a limit but cursor pagination is absent. |
| Performance measurement | Partially implemented | Current web export: 1,249 modules, 2,852,147 JS bytes, 7,108,850 total bytes. A comparable pre-change byte baseline was not captured, so no percentage claim is made. |
| Automated verification | Implemented and verified | TypeScript passed; 8 frontend and 4 backend tests passed; production web export passed. Expo Doctor passed 17/18 checks. |

## Root causes and risks

1. The reporting flow mixed two database schemas (`issues` and `reports`) and did not send the fields required by the migration-backed schema. The client now consistently targets `issues`; migration 008 adds reliability metadata.
2. Upload errors returned a local URI as if submission succeeded. Upload errors now throw and preserve the draft.
3. Camera/location flows used optimistic demo assumptions. Permission prompts are action-driven and missing GPS is explicit.
4. Authority seed records lacked provenance and were displayed as authoritative. Recommendations are now labelled seed/unverified; the data still needs a sourced verification project.
5. Deep-link sharing was described as successful publication. UI language now distinguishes opening a composer from confirmed publication.
6. Existing schema generations conflict and should not both be applied to a new database. The supported migration chain is `backend/supabase/migrations/001...008`; `backend/db/schema*.sql` should be treated as legacy reference until consolidated.

## Highest-priority remaining work

1. Apply and test migration 008 in a staging Supabase project.
2. Move private evidence to a private bucket and serve short-lived signed URLs after authorization.
3. Test camera, gallery, GPS accuracy, orientation, compression and interruption on physical Android and iOS devices.
4. Add an embedded map-pin selector and maximum-age policy for GPS readings.
5. Verify every authority/contact claim against official sources and populate source/verification fields.
6. Add the timeline/reminder/resolution UI and a durable offline sync queue.
7. Configure and evaluate an AI provider before exposing the optional analysis action in production.

