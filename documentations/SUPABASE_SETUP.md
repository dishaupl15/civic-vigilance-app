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
`010_issue_location_integrity.sql` under `backend/supabase/migrations/`.
Migration 010 is a proposed, unapplied constraint migration for issue
coordinates and accuracy; it is not proof that the constraints exist remotely.
The earlier migrations create and evolve the tables, foreign keys, triggers,
RLS policies, and storage configuration used by the current application.

**Local migration files do not prove that any migration has been applied to
your Supabase project.** Before changing a project that already contains data:

1. In Supabase Dashboard, open **Database → Migrations** and compare the
   project's migration history with the local migration files. Review migration
   010 against the remote schema and run its read-only data preflight before
   deciding whether it is safe to apply.
2. If SQL was previously pasted into SQL Editor, verify the actual tables,
   columns, constraints, policies, triggers, and buckets too; manually applied
   SQL may not appear in the migration history.
3. Back up the project and review the proposed migration plan against its
   existing schema and data. Migration `006_optimize_schema.sql` includes
   orphan-row cleanup, and later migrations alter RLS and storage policies.
4. Apply only migrations confirmed to be pending, in numeric order, using the
   team's reviewed migration workflow. Do not paste all files blindly, rerun
   migration SQL, or reset a production database.

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
