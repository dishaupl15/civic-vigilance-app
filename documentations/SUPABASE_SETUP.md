# 🚀 Supabase Setup Guide for CivicVigilance

This guide will help you set up Supabase as the backend for your CivicVigilance app. Follow these steps carefully.

## 📋 Prerequisites

- A Supabase account (free tier is perfect to start)
- Basic understanding of SQL
- Your CivicVigilance code cloned locally

---

## 🎯 Step 1: Create Supabase Project

### 1.1 Sign Up/Login to Supabase
1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" or "Sign in"
3. Use GitHub, Google, or email to authenticate

### 1.2 Create New Project
1. Click "New Project"
2. Fill in details:
   - **Project Name**: `civicvigilance` (or your choice)
   - **Database Password**: Generate a strong password (SAVE THIS!)
   - **Region**: Choose closest to your users (e.g., Mumbai for India)
   - **Pricing Plan**: Free (perfect for MVP)
3. Click "Create new project"
4. **Wait 2-3 minutes** for project to provision

---

## 🗄️ Step 2: Run Database Migrations

### 2.1 Open SQL Editor
1. In your Supabase dashboard, click **SQL Editor** (left sidebar)
2. Click "New query"

### 2.2 Reconcile and Apply Database Migrations

The repository contains migrations `001_initial_schema.sql` through
`012_report_location_address_limit.sql` under `backend/supabase/migrations/`.
Migration `010_issue_location_integrity.sql` adds coordinate/accuracy
constraints; migration `011_report_assistance_persistence.sql` adds
owner-scoped report suggestions and generated-draft tables; migration
`012_report_location_address_limit.sql` bounds saved report addresses. These
files are not proof that their changes exist remotely.
The earlier migrations create and evolve the tables, foreign keys, triggers,
RLS policies, and storage configuration used by the current application.

**Local migration files do not prove that any migration has been applied to
your Supabase project.** Before changing a project that already contains data:

1. Confirm the intended project ref in **Project Settings → General**. From
   `backend/`, authenticate/link only that project and inspect its migration
   history:
   ```powershell
   npx --yes supabase@2.121.0 login
   npx --yes supabase@2.121.0 link --project-ref YOUR_CONFIRMED_PROJECT_REF
   npx --yes supabase@2.121.0 migration list --linked
   npm run db:push:dry
   ```
   The migration list and dry run are read-only. Review the entire dry-run
   output; it may include every older local migration that is absent remotely,
   not just 011 and 012. Do not run `npm run db:push` until that plan and the
   checks below are approved.
2. In the SQL Editor for the same project, run the read-only catalog/data
   checks below. They do not assume a migration-history table. Reconcile the
   results with the CLI migration list.
3. If any object from 011 already exists but that migration is not recorded as
   applied, stop. Do not rerun its `CREATE TABLE` statements or mark it applied
   without reconciling the actual schema and getting database-owner approval.
4. Review the address preflight for 012. Its `NOT VALID` constraint allows
   existing overlength addresses to remain, but a later update to such a row
   can fail. Decide how to clean those rows before approving application.
5. Back up the project and obtain database-owner approval. Apply only the
   reviewed pending migrations in order through the linked CLI workflow, then
   verify migration history and catalog state again. Do not use the legacy
   `backend/apply-migrations.sh`: its hard-coded migration lists stop at 006
   and it is not appropriate for this migration sequence.

Read-only catalog and preflight checks:

```sql
-- Present tables and row-level security status.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('issues', 'authorities',
                     'issue_authority_suggestions', 'issue_generated_content')
ORDER BY c.relname;

-- Columns and types required by the migrations and frontend queries.
SELECT table_name, column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('issues', 'authorities',
                     'issue_authority_suggestions', 'issue_generated_content')
ORDER BY table_name, ordinal_position;

-- Foreign keys, unique/check constraints, and validation state.
SELECT conrelid::regclass AS table_name, conname, contype,
       pg_get_constraintdef(oid) AS definition, convalidated
FROM pg_constraint
WHERE conrelid IN (
  to_regclass('public.issues'), to_regclass('public.authorities'),
  to_regclass('public.issue_authority_suggestions'),
  to_regclass('public.issue_generated_content')
)
ORDER BY table_name::text, conname;

-- Indexes on affected tables.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('issues', 'issue_authority_suggestions',
                    'issue_generated_content')
ORDER BY tablename, indexname;

-- RLS policies on affected tables.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('issues', 'authorities',
                    'issue_authority_suggestions', 'issue_generated_content')
ORDER BY tablename, policyname;

-- User-defined triggers on affected tables (011 itself adds none).
SELECT c.relname AS table_name, t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('issues', 'authorities',
                    'issue_authority_suggestions', 'issue_generated_content')
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;

-- 012 preflight. This returns counts only, not address values.
SELECT count(*) AS addresses_over_300,
       max(char_length(address)) AS longest_address
FROM public.issues
WHERE char_length(address) > 300;

-- 011 directory readiness: eligible rows must be active and explicitly verified.
SELECT a.verification_status, a.status,
       a.social_media #>> '{twitter,verified}' AS twitter_verified,
       a.social_media #>> '{twitter,active}' AS twitter_active,
       count(*) AS authority_rows
FROM public.authorities a
GROUP BY a.verification_status, a.status,
         a.social_media #>> '{twitter,verified}',
         a.social_media #>> '{twitter,active}'
ORDER BY a.verification_status, a.status;
```

These catalog queries return only objects that currently exist and do not
write data. If a table or migration object already exists outside recorded
migration history, stop and reconcile it; do not blindly rerun SQL. Use the
Supabase Dashboard migration page or linked CLI command for migration history
rather than assuming a particular internal history table.

For a new, empty project, use the same reviewed migration workflow from
`backend/` and verify the resulting schema before configuring the app. The
seed data in migration `003_seed_authorities.sql` is separate from the schema
and should not be rerun without checking whether it is already present.

## 🔐 Step 3: Get API Credentials

### 3.1 Get Your API Keys
1. In Supabase dashboard, go to **Settings** → **API**
2. Find these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: Long string starting with `eyJ...`

### 3.2 Update Your .env File
1. In your project root, create `.env` (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. Add your Supabase credentials:
   ```bash
   # Supabase Configuration
   EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

   # Set backend mode to Supabase
   EXPO_PUBLIC_BACKEND_MODE=supabase
   ```

3. **IMPORTANT**: Never commit `.env` to Git! It's already in `.gitignore`.

### 3.3 Keep frontend and backend on the same project

The mobile app reads `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` from `frontend/.env`. The backend reads
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (or legacy
`SUPABASE_ANON_KEY`) from `backend/.env`. Set each URL and client key to values
from the same Supabase project; otherwise reports and authentication can be
split across projects.

For report-assistance generation, set backend-only `AI_TEXT_ENDPOINT` and
`AI_TEXT_API_KEY` together. The endpoint must be HTTPS and implement the JSON
contract in `backend/src/report-content.js`; the repository does not select or
verify a particular provider. These variables are optional for backend
startup, so a successful backend environment check does not prove that draft
generation is configured. Set frontend `EXPO_PUBLIC_NODE_API_URL` to the
deployed API base ending in `/api`; production builds require HTTPS. Do not
place AI keys in frontend environment variables.

The backend's `SUPABASE_SECRET_KEY` (or legacy
`SUPABASE_SERVICE_ROLE_KEY`) is server-only and is used for privileged admin
operations. Never place it in frontend files or an `EXPO_PUBLIC_` variable.
For a Vercel-hosted backend, configure `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`), and the server-only
`SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) in the backend
deployment's environment settings. Keep the URL and keys scoped to the same
project in each deployment environment.

---

## 🖼️ Step 4: Configure Storage for Images

### 4.1 Verify Storage Buckets

After reconciling the migrations, open **Storage → Buckets** and verify:

- `issue-photos` exists and is **public** for public report photos.
- `avatars` exists and is **public** for profile images.
- `private-issue-photos` exists and is **private** for private report evidence.

The migrations configure these buckets and access policies, but local SQL files
do not prove they exist in the remote project. Check the corresponding Storage
policies as well. Do not create or change buckets until the remote project
state and migration history have been checked.

Migration `009` configures a 10 MiB limit and image MIME type restrictions for
the two report-photo buckets.
## 🔒 Step 5: Configure Authentication

### 5.1 Enable Email Auth
1. Go to **Authentication** → **Providers**
2. **Email** should be enabled by default
3. Configure:
   - ✅ Enable Email provider
   - ✅ Confirm email: ON (recommended)
   - Email templates: You can customize later

### 5.2 Enable Google OAuth (For "Sign in with Google")
1. Still in **Authentication** → **Providers**
2. Click **Google**
3. Enable the provider
4. You'll need:
   - Google Client ID
   - Google Client Secret

**Get Google Credentials:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create project → Enable OAuth
3. Get Client ID and Secret
4. Paste into Supabase

### 5.3 Configure email confirmation and app redirects

The app selects a callback according to its runtime platform:

- Native Expo: `civicvigilance://auth/callback`
- Production web: `https://civic-vigilance-app.vercel.app/`
- Local web development: the current Expo web origin at `/` (Expo defaults to
  port `8081`; use the actual origin shown by the development server if its port
  changes).

In **Authentication → URL Configuration → Redirect URLs**, allow the exact
production web URL and native URI above, plus the exact local web origin(s)
used for development (for example `http://localhost:8081/` and
`http://127.0.0.1:8081/` if both are used). If Expo selects a different port,
add that exact origin. Do not use broad wildcards, an obsolete
`civicvigilance://oauth/callback`, or a localhost URL as the production Site URL.

Set **Site URL** to `https://civic-vigilance-app.vercel.app/`. Explicit
`emailRedirectTo`/`redirectTo` values are selected by the app and must each be
in the Redirect URLs allow list. The web callback returns to the app root; the
app exchanges the PKCE code before it renders authenticated routes. Native
callbacks continue to use the registered custom scheme.

Under **Authentication → Email Templates → Confirm signup**, use Supabase's
confirmation URL variable, for example:

```html
<a href="{{ .ConfirmationURL }}">Confirm your email</a>
```

Do not hardcode a localhost URL, `{{ .SiteURL }}`, or a manually constructed
verification URL in the confirmation link. Supabase's
`{{ .ConfirmationURL }}` applies the requested redirect after validating the
one-time confirmation token. If custom SMTP is enabled, confirm that it
delivers the current template and that its sender/domain configuration is
verified; SMTP does not determine the app callback URI.

If testing with Expo Go rather than the installed development build, the
callback scheme may differ; this project currently uses a native development
build and does not generate an Expo Go redirect dynamically.

---

## 🧪 Step 6: Test Your Setup

### 6.1 Install Dependencies
```bash
npm install @supabase/supabase-js
npm install react-native-url-polyfill
```

### 6.2 Test Database Connection
1. Start your app:
   ```bash
   npm start
   ```

2. Open Expo Go on your phone (or simulator)

3. Try creating an account:
   - You should be able to sign up
   - Check **Authentication** → **Users** in Supabase dashboard
   - Your user should appear!

### 6.3 Test Issue Creation
1. Try creating a test issue in the app
2. Go to **Table Editor** → `issues` in Supabase
3. Your issue should appear!

---

## 📊 Step 7: Monitor Your App

### 7.1 Enable Realtime (Optional)
1. Go to **Database** → **Replication**
2. Enable realtime for tables you want live updates:
   - `issues` ✅
   - `comments` ✅
   - `votes` ✅
   - `notifications` ✅

### 7.2 Set Up Logs
1. Go to **Logs** → **Database**
2. You can see all queries in real-time
3. Useful for debugging!

---

## 🔧 Troubleshooting

### Problem: "No rows returned" when creating issue
**Solution:** Check Row Level Security policies. User must be authenticated.

```sql
-- Verify RLS is working
SELECT * FROM public.issues;  -- Should only show your issues
```

### Problem: "Permission denied for table users"
**Solution:** RLS is blocking you. Check policies:

```sql
-- Check policies
SELECT * FROM pg_policies WHERE tablename = 'issues';
```

### Problem: Images not uploading
**Solution:** Check storage bucket policies:

1. In **Storage → Policies**, review policies for `issue-photos`,
   `private-issue-photos`, and `avatars`.
2. Compare them with the policies in the reconciled local migrations. Do not
   create or broaden policies until the remote migration history and bucket
   visibility have been verified.

### Problem: Geospatial queries not working
**Solution:** Ensure PostGIS is enabled:

```sql
-- Check if PostGIS is enabled
SELECT PostGIS_Version();
```

---

## 🚀 Next Steps

### Optimize Performance
1. **Add indexes** as your data grows:
   ```sql
   -- If queries are slow, add custom indexes
   CREATE INDEX idx_custom ON issues(created_at DESC, category);
   ```

2. **Enable caching** (Supabase Pro):
   - Go to Settings → API → Edge Functions
   - Enable Supabase Cache

### Set Up Backups (Recommended)
1. Go to **Settings** → **Database**
2. Enable **Point-in-Time Recovery** (Pro plan)
3. Or use **pg_dump** manually:
   ```bash
   pg_dump -h db.xxx.supabase.co -U postgres civicvigilance > backup.sql
   ```

### Monitor Usage
1. Go to **Settings** → **Billing**
2. Monitor:
   - Database size (500MB free tier limit)
   - API requests (unlimited on free tier!)
   - Storage (1GB free tier)
   - Bandwidth (2GB free tier)

---

## 📈 Scaling Guide

### When You Outgrow Free Tier

**Upgrade to Pro ($25/month) when:**
- Database > 500MB
- Bandwidth > 2GB/month
- Need daily backups
- Need email support

**Pro Plan Includes:**
- 8GB database
- 100GB storage
- 250GB bandwidth
- Daily backups
- Email support

**When to Consider Enterprise:**
- 10K+ daily active users
- Need SLA guarantees
- Need dedicated support
- Multi-region deployment

---

## 🛠️ Advanced: PostGIS Queries

Your database is now powered by PostGIS! Here are some powerful queries:

### Find Issues Within 2km
```sql
SELECT
  id,
  title,
  ST_Distance(
    location,
    ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography
  ) / 1000 as distance_km
FROM issues
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography,
  2000  -- 2km in meters
)
ORDER BY distance_km;
```

### Get Authorities for a Location
```sql
SELECT * FROM get_authorities_for_issue(
  12.9716,  -- latitude
  77.5946,  -- longitude
  'tdr1',   -- geohash
  'pothole', -- category
  5         -- limit
);
```

---

## 📞 Support

### Supabase Support
- Docs: [https://supabase.com/docs](https://supabase.com/docs)
- Discord: [https://discord.supabase.com](https://discord.supabase.com)
- GitHub Issues: [https://github.com/supabase/supabase](https://github.com/supabase/supabase)

### CivicVigilance Support
- Issues: [Your GitHub repo]/issues
- Questions: Create a GitHub Discussion

---

## ✅ Checklist

Before going live, ensure:

- [ ] All 3 migrations run successfully
- [ ] .env file has correct credentials
- [ ] Storage bucket created and public
- [ ] RLS policies enabled on all tables
- [ ] Google OAuth configured (if using)
- [ ] Test user can sign up
- [ ] Test user can create issue
- [ ] Test user can upvote/comment
- [ ] Images upload successfully
- [ ] Nearby issues query works
- [ ] Authority matching works

---

## 🎉 You're All Set!

Your CivicVigilance app is now powered by Supabase with:
- ✅ PostgreSQL database with PostGIS
- ✅ Real-time subscriptions
- ✅ Secure Row Level Security
- ✅ File storage for images
- ✅ Authentication ready
- ✅ 15+ civic authorities pre-loaded
- ✅ Geospatial queries optimized
- ✅ Free tier for MVP

**Happy building! 🚀**
