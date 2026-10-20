# Twitter Setup - Quick Start Guide

> Historical setup guide; its Supabase Edge Function setup and claims about
> configured credentials are obsolete. Use `backend/README.md` and
> `PRODUCTION_SETUP.md` for current X account-linking setup. Posting is not
> implemented.

Your project is configured and ready! Here's what to do next:

## 📋 Your Project Info

- **Project ID:** `endrnbacxyjpxvgxhpjj`
- **Supabase URL:** `https://endrnbacxyjpxvgxhpjj.supabase.co`
- **Functions URL:** `https://endrnbacxyjpxvgxhpjj.supabase.co/functions/v1`

✅ Already configured in your `.env` file!

---

## 🚀 Setup Steps

### Step 1: Login to Supabase (Do this now!)

Open a **new terminal** and run:

```bash
npx supabase login
```

This will:
1. Open your browser
2. Ask you to authorize
3. Save credentials locally

**Then, link your project:**

```bash
npx supabase link --project-ref endrnbacxyjpxvgxhpjj
```

When prompted for database password, use the password you created when setting up your Supabase project.

---

### Step 2: Get Twitter API Credentials

#### A. Apply for Twitter Developer Account

1. Go to: https://developer.twitter.com/
2. **Sign in** with your **@CivicVigilance** Twitter account
3. Click **"Apply for a developer account"**
4. Select **"Free"** tier
5. Fill out the form:
   - **Use case:** Civic issue reporting and community engagement
   - **Will you display tweets?** Yes, in our app
   - **Will you make Twitter content available to government?** No

#### B. Create Twitter App

1. Go to: https://developer.twitter.com/en/portal/dashboard
2. Click **"+ Create Project"** or **"+ Add App"**
3. Fill in details:
   - **App name:** `CivicVigilance`
   - **Description:** `Civic issue reporting platform for community engagement`
   - **Website URL:** Your GitHub or app website
   - **Callback URLs:** Add these:
     - `https://endrnbacxyjpxvgxhpjj.supabase.co/functions/v1/twitter-auth`
     - `civicvigilance://oauth/twitter`

#### C. Get API Keys

After creating the app, go to **"Keys and tokens"** tab:

1. **API Key and Secret** (under "Consumer Keys")
   - Click **"Regenerate"** if needed
   - Save these!

2. **Bearer Token** (under "Authentication Tokens")
   - Click **"Generate"** if not shown
   - Save it!

3. **Access Token and Secret** (under "Access Token and Secret")
   - Click **"Generate"**
   - These are for posting from @CivicVigilance account
   - Save these!

**You should have 5 values:**
- ✅ API Key (Consumer Key)
- ✅ API Secret (Consumer Secret)
- ✅ Bearer Token
- ✅ Access Token
- ✅ Access Token Secret

---

### Step 3: Store Secrets in Supabase

After you have the Twitter credentials, run our setup script:

```bash
./setup-twitter.sh
```

This will:
1. Prompt you for each credential
2. Store them securely in Supabase
3. Verify they're saved

**Alternative: Manual Setup**

If the script doesn't work, run these commands manually:

```bash
npx supabase secrets set TWITTER_API_KEY="your_api_key_here"
npx supabase secrets set TWITTER_API_SECRET="your_api_secret_here"
npx supabase secrets set TWITTER_BEARER_TOKEN="your_bearer_token_here"
npx supabase secrets set TWITTER_ACCESS_TOKEN="your_access_token_here"
npx supabase secrets set TWITTER_ACCESS_TOKEN_SECRET="your_access_token_secret_here"
```

---

### Step 4: Deploy Edge Functions

After secrets are stored, deploy the functions:

```bash
./deploy-twitter-functions.sh
```

Or manually:

```bash
npx supabase functions deploy post-tweet-civic
npx supabase functions deploy post-tweet-user
npx supabase functions deploy twitter-auth
npx supabase functions deploy disconnect-twitter
```

---

### Step 5: Test!

Start your app:

```bash
npm start
```

Try:
1. Create a new issue
2. Select "Post to Twitter"
3. Choose "Civic Vigilance Account"
4. Submit!

Your issue should be posted to Twitter! 🎉

---

## 🧪 Test Functions Manually

Test if functions are deployed:

```bash
# Test basic function access
curl https://endrnbacxyjpxvgxhpjj.supabase.co/functions/v1/post-tweet-civic
```

---

## ✅ Checklist

Before going live:

- [ ] Logged into Supabase CLI
- [ ] Project linked (`endrnbacxyjpxvgxhpjj`)
- [ ] Twitter Developer account approved
- [ ] Twitter app created
- [ ] Got all 5 API credentials
- [ ] Secrets stored in Supabase
- [ ] All 4 functions deployed
- [ ] Tested posting from app

---

## 🔧 Troubleshooting

### "Error: Failed to link project"
- Make sure you're logged in: `npx supabase login`
- Check your database password
- Try again with: `npx supabase link --project-ref endrnbacxyjpxvgxhpjj`

### "Twitter API error: 401 Unauthorized"
- Check secrets are set: `npx supabase secrets list`
- Verify credentials are correct in Twitter Developer Portal
- Make sure app has read/write permissions

### "Function not found"
- Deploy functions: `./deploy-twitter-functions.sh`
- Check deployment: `npx supabase functions list`

### "CORS error"
- Functions already handle CORS
- Make sure you're using the correct URL in `.env`

---

## 📞 Support

**Twitter Developer Portal:**
https://developer.twitter.com/en/support

**Supabase Docs:**
https://supabase.com/docs/guides/functions

**Your Functions Dashboard:**
https://supabase.com/dashboard/project/endrnbacxyjpxvgxhpjj/functions

---

## 🎯 Quick Commands Reference

```bash
# Login
npx supabase login

# Link project
npx supabase link --project-ref endrnbacxyjpxvgxhpjj

# Store secrets (interactive)
./setup-twitter.sh

# Deploy functions
./deploy-twitter-functions.sh

# List functions
npx supabase functions list

# View logs
npx supabase functions logs post-tweet-civic

# Test backend
node test-backend-simple.js
```

---

**Ready? Start with:** `npx supabase login` 🚀
