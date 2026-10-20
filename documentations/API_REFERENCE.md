# API Reference - CivicVigilance

This document explains where all the APIs are located and how they work.

## 📍 API Architecture Overview

```
Frontend (React Native)
    ↓ (API calls)
Supabase Client (lib/supabase.ts)
    ↓
Supabase Backend
    ├── Database (PostgreSQL)
    ├── Auth (Authentication)
    ├── Storage (File uploads)
    └── Edge Functions (Serverless)
```

---

## 🎯 Frontend APIs (Client-Side)

### 1. Authentication APIs

**File:** `hooks/useAuth.tsx`

**Base URL:** Handled by Supabase Auth

**Functions:**

| Function | Parameters | Returns | Database Table |
|----------|-----------|---------|----------------|
| `signIn()` | email, password | `{ error?: string }` | `auth.users` |
| `signUp()` | email, password | `{ error?: string }` | `auth.users` |
| `resetPassword()` | email | `{ error?: string }` | `auth.users` |
| `signOut()` | - | `Promise<void>` | - |

**Example:**
```typescript
import { useAuth } from '../hooks/useAuth';

const { signIn, signUp } = useAuth();

// Sign in
const result = await signIn('user@example.com', 'password123');
if (result?.error) {
  console.error(result.error);
}
```

---

### 2. Issue/Report APIs

**File:** `hooks/useIssues.ts`

**Base URL:** Supabase Database (`issues` table)

**Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `useIssues()` | sort, coords | `{ data: Issue[], loading: boolean }` | Fetch issues list |
| `createIssue()` | payload | `Issue` | Create new issue |

**Payload Structure:**
```typescript
{
  title: string;           // Required
  description: string;     // Optional
  category: string;        // Required (pothole, garbage, etc.)
  image_url?: string;      // Optional (photo URL)
  lat?: number;           // Optional (latitude)
  lng?: number;           // Optional (longitude)
  address?: string;       // Optional (full address)
}
```

**Example:**
```typescript
import { createIssue } from '../hooks/useIssues';

const issue = await createIssue({
  title: 'Pothole on Main Street',
  description: 'Large pothole causing traffic issues',
  category: 'pothole',
  image_url: 'https://...photo.jpg',
  lat: 12.9716,
  lng: 77.5946,
  address: 'Main Street, Bangalore, India'
});
```

---

### 3. Profile APIs

**File:** `lib/profile.ts`

**Base URL:** Supabase Database (`profiles` table)

**Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `loadProfile()` | userId | `UserProfile` | Get user profile |
| `saveProfile()` | profile | `UserProfile` | Update profile |
| `pickAvatar()` | - | `string \| null` | Select avatar from gallery |

**Profile Structure:**
```typescript
{
  id: string;              // User ID (UUID)
  full_name?: string;      // Display name/username
  avatar_url?: string;     // Avatar photo URL
  created_at?: string;     // ISO timestamp
}
```

**Example:**
```typescript
import { loadProfile, saveProfile } from '../lib/profile';

// Load profile
const profile = await loadProfile(userId);

// Update profile
await saveProfile({
  id: userId,
  full_name: 'John Doe',
  avatar_url: 'https://...avatar.jpg'
});
```

---

### 4. Storage APIs

**File:** `lib/storage.ts` *(newly created)*

**Base URL:** Supabase Storage (`civic-vigilance` bucket)

**Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `uploadPhoto()` | uri, folder | `string` | Upload single photo, returns URL |
| `uploadPhotos()` | uris[], folder | `string[]` | Upload multiple photos |
| `deletePhoto()` | url | `Promise<void>` | Delete a photo |

**Example:**
```typescript
import { uploadPhotos } from '../lib/storage';

// Upload photos from camera/gallery
const photoUrls = await uploadPhotos(
  ['file:///.../photo1.jpg', 'file:///.../photo2.jpg'],
  'issues'  // folder name
);

// Returns: ['https://...supabase.co/storage/v1/.../photo1.jpg', ...]
```

**Storage Bucket Structure:**
```
civic-vigilance/
├── issues/
│   ├── 1733234567_abc123.jpg
│   ├── 1733234568_def456.jpg
│   └── ...
├── profiles/
│   ├── 1733234569_ghi789.jpg
│   └── ...
└── test/
    └── (test files)
```

---

### 5. Vote APIs

**File:** `lib/votes.ts`

**Base URL:** Supabase Database (`votes` table)

**Functions:**

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `castVote()` | issueId, voteType | `Promise<void>` | Upvote or downvote |
| `getVoteStatus()` | issueId | `'upvote' \| 'downvote' \| null` | Check user's vote |

**Example:**
```typescript
import { castVote } from '../lib/votes';

// Upvote an issue
await castVote(issueId, 'upvote');

// Downvote an issue
await castVote(issueId, 'downvote');
```

---

### 6. X Account Connection

The account-linking UI uses `lib/xConnectionApi.ts` and the authenticated
Node.js API. Tokens are handled server-side; these endpoints do not publish
posts.

| Method | Endpoint | Authentication | Purpose |
|--------|----------|----------------|---------|
| `POST` | `/api/x/connect` | Supabase bearer token | Start PKCE authorization for the authenticated user |
| `GET` | `/api/x/connect/callback` | One-time OAuth state | Complete authorization and verify X identity |
| `GET` | `/api/x/connection` | Supabase bearer token | Read the caller's safe connection status |
| `DELETE` | `/api/x/connection` | Supabase bearer token | Disconnect the caller's X account |

The legacy Supabase Edge Function Twitter endpoints documented in older
versions of this file are retired; do not use them or send a client-supplied
user ID as ownership proof. X post publishing is not implemented.

---

## 🗄️ Database Tables & APIs

### Direct Supabase Queries

**File:** `lib/supabase.ts` (Supabase client initialization)

**Usage:** All frontend APIs use this client

**Tables:**

| Table | Purpose | RLS Enabled | API Access |
|-------|---------|-------------|------------|
| `auth.users` | User accounts | ✅ | Via `useAuth` hook |
| `profiles` | User profiles | ✅ | Via `lib/profile.ts` |
| `issues` | Issue reports | ✅ | Via `hooks/useIssues.ts` |
| `votes` | Upvotes/downvotes | ✅ | Via `lib/votes.ts` |
| `comments` | Issue comments | ✅ | Direct queries |
| `authorities` | Authority contacts | ✅ | Via `lib/authorities.ts` |

---

## 🔐 Authentication Flow

```
1. User calls signUp(email, password)
   ↓
2. useAuth hook → supabase.auth.signUp()
   ↓
3. Supabase creates user in auth.users table
   ↓
4. Trigger creates profile in profiles table
   ↓
5. Session token returned to client
   ↓
6. Token stored in AsyncStorage
   ↓
7. All subsequent API calls include auth token
```

---

## 📤 Issue Submission Flow

```
1. User fills out report form
   ↓
2. handleStage4Submit() called
   ↓
3. uploadPhotos() uploads to Supabase Storage
   ↓ (returns photo URLs)
4. createIssue() saves to database
   ↓
5. Issue appears in feed
   ↓
6. (Optional) Post to Twitter via Edge Function
```

---

## 🔧 API Configuration

### Environment Variables (.env)

```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://endrnbacxyjpxvgxhpjj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...

# Backend Mode
EXPO_PUBLIC_BACKEND_MODE=supabase

# API URL (for Edge Functions)
EXPO_PUBLIC_API_URL=https://endrnbacxyjpxvgxhpjj.supabase.co/functions/v1
```

### Supabase Client Initialization

**File:** `lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
    }
  }
);
```

---

## 🧪 Testing APIs

### Using Console

```typescript
// In any component
import { supabase } from '../lib/supabase';

// Test database query
const { data, error } = await supabase
  .from('issues')
  .select('*')
  .limit(10);

console.log('Issues:', data);
```

### Using Postman/cURL

**Test Edge Function:**
```bash
curl -X POST \
  https://endrnbacxyjpxvgxhpjj.supabase.co/functions/v1/twitter-auth \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code": "test_code", "userId": "test_uuid"}'
```

---

## 📊 API Summary Table

| API Category | Location | Purpose | Status |
|--------------|----------|---------|--------|
| **Authentication** | `hooks/useAuth.tsx` | Login/Signup/Logout | ✅ Working |
| **Issues** | `hooks/useIssues.ts` | CRUD operations | ✅ Working |
| **Storage** | `lib/storage.ts` | Photo uploads | ✅ **NEW** |
| **Profile** | `lib/profile.ts` | User profile | ✅ Working |
| **Votes** | `lib/votes.ts` | Upvote/downvote | ✅ Working |
| **Twitter Auth** | `supabase/functions/twitter-auth/` | OAuth flow | ⚠️ Needs config |
| **Tweet Posting** | `supabase/functions/post-tweet-*/` | Post tweets | ⚠️ Needs config |

---

## 🔍 Finding API Calls in Code

### Search Commands

```bash
# Find all Supabase queries
grep -r "supabase.from" . --include="*.ts" --include="*.tsx"

# Find all auth calls
grep -r "supabase.auth" . --include="*.ts" --include="*.tsx"

# Find all storage calls
grep -r "supabase.storage" . --include="*.ts" --include="*.tsx"
```

---

## 🚧 Not Yet Implemented

These are referenced but not yet fully implemented:

1. **Twitter Posting** - Edge Functions exist but need credentials
2. **Real-time Updates** - Supabase Realtime not yet configured
3. **Push Notifications** - Mentioned in types but not implemented
4. **Geolocation Queries** - PostGIS functions defined but not used

---

## 📚 Related Documentation

- [Backend Connection Summary](./BACKEND_CONNECTION_SUMMARY.md)
- [Storage Setup Guide](./STORAGE_SETUP.md)
- [Supabase Setup](./SUPABASE_SETUP.md)
- [Testing Guide](./TESTING.md)

---

**Last Updated:** 2025-12-03
