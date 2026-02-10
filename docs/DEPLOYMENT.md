# PUMi Deployment Guide

Complete guide for deploying PUMi to production.

## Architecture Overview

```
┌─────────────────┐
│   Vercel/       │
│   Netlify       │  Frontend (React)
│   (Frontend)    │
└────────┬────────┘
         │
         │ HTTPS
         ↓
┌─────────────────┐
│   Railway       │
│   (Backend)     │  FastAPI + Python
└────────┬────────┘
         │
         ├──→ Supabase (Auth + DB)
         ├──→ Anthropic API (Claude)
         └──→ Stripe (Billing)
```

## Prerequisites

### Accounts You'll Need

1. **GitHub** - Code repository
2. **Supabase** - Database and authentication
3. **Anthropic** - Claude API for AI conversations
4. **Railway** - Backend hosting
5. **Vercel** or **Netlify** - Frontend hosting
6. **Stripe** - Payment processing

### Tools to Install

- Git
- Node.js 18+
- Python 3.12+
- Railway CLI (optional)
- Vercel CLI (optional)

---

## Step 1: Setup Supabase

### 1.1 Create Supabase Project

1. Go to https://supabase.com
2. Click "New Project"
3. Choose organization and region
4. Set database password (save this!)

### 1.2 Get API Keys

From Supabase dashboard:
- Go to Settings → API
- Copy:
  - **Project URL** (e.g., `https://xxx.supabase.co`)
  - **anon/public key** (starts with `eyJhbG...`)
  - **service_role key** (starts with `eyJhbG...`)

### 1.3 Create Database Schema

Go to SQL Editor in Supabase and run:

```sql
-- User profiles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  tier TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Focus plans
CREATE TABLE focus_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  focus_type TEXT NOT NULL,
  duration INTEGER DEFAULT 45,
  language TEXT DEFAULT 'hu',
  status TEXT DEFAULT 'in_progress',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Focus days
CREATE TABLE focus_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES focus_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  title TEXT,
  content JSONB,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Focus items (lessons, quizzes, etc.)
CREATE TABLE focus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID REFERENCES focus_days(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT,
  content JSONB,
  sequence INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Focus item progress
CREATE TABLE focus_item_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID REFERENCES focus_items(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  response JSONB,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, item_id)
);

-- User focus statistics
CREATE TABLE user_focus_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_days_completed INTEGER DEFAULT 0,
  last_completed_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_focus_plans_user_id ON focus_plans(user_id);
CREATE INDEX idx_focus_days_plan_id ON focus_days(plan_id);
CREATE INDEX idx_focus_items_day_id ON focus_items(day_id);
CREATE INDEX idx_focus_item_progress_user ON focus_item_progress(user_id);
```

### 1.4 Enable Google Auth

1. Go to Authentication → Providers
2. Enable Google
3. Add OAuth credentials:
   - Go to https://console.cloud.google.com
   - Create OAuth 2.0 Client ID
   - Add authorized redirect URI: `https://xxx.supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret to Supabase

---

## Step 2: Setup Anthropic API

1. Go to https://console.anthropic.com
2. Create API key
3. Copy the key (starts with `sk-ant-`)
4. Save for backend configuration

---

## Step 3: Setup Stripe

### 3.1 Create Stripe Account

1. Go to https://stripe.com
2. Create account
3. Get API keys from Dashboard → Developers → API keys
4. Copy:
   - **Secret key** (starts with `sk_test_` or `sk_live_`)
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)

### 3.2 Create Products and Prices

1. Go to Products
2. Create two products:

**GenZ Tier**
- Name: "PUMi GenZ"
- Pricing: Monthly subscription
- Copy the Price ID (starts with `price_`)

**Millennial Tier**
- Name: "PUMi Millennial"
- Pricing: Monthly subscription
- Copy the Price ID

### 3.3 Setup Webhook

1. Go to Developers → Webhooks
2. Add endpoint: `https://your-backend-url/webhooks/stripe`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
4. Copy webhook secret (starts with `whsec_`)

---

## Step 4: Deploy Backend to Railway

### 4.1 Create Railway Project

1. Go to https://railway.app
2. Click "New Project"
3. Choose "Deploy from GitHub repo"
4. Select your repository
5. Set root directory: `backend`

### 4.2 Configure Environment Variables

Add these in Railway dashboard → Variables:

```bash
# Claude API
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_MODEL_SONNET=claude-sonnet-4-20250514
CLAUDE_MODEL_HAIKU=claude-3-haiku-20240307

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_KEY=eyJhbGciOiJI...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_GENZ=price_...
STRIPE_PRICE_ID_MILLENNIAL=price_...

# Build
BUILD_TAG=production-v1.0.0

# Railway (optional - for internal auth)
RAILWAY_TOKEN=your_railway_token
```

### 4.3 Configure Build Settings

In Railway:
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 4.4 Deploy

Railway will auto-deploy on push to main branch.

Your backend URL will be: `https://your-app-name.up.railway.app`

---

## Step 5: Deploy Frontend to Vercel

### 5.1 Import Project

1. Go to https://vercel.com
2. Click "Add New Project"
3. Import your GitHub repository
4. Set root directory: `frontend`

### 5.2 Configure Build Settings

- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 5.3 Add Environment Variables

In Vercel dashboard → Settings → Environment Variables:

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJI...
VITE_SUPABASE_PROJECT_ID=xxx
```

### 5.4 Deploy

Click "Deploy" - Vercel will build and deploy automatically.

Your frontend URL will be: `https://your-app-name.vercel.app`

---

## Step 6: Configure CORS

Update backend CORS settings in `backend/app/main.py`:

```python
ALLOWED_ORIGINS = [
    "https://your-app-name.vercel.app",
    "https://www.yourdomain.com",  # if using custom domain
    "http://localhost:5173",        # for local dev
]
```

Redeploy backend after this change.

---

## Step 7: Custom Domain (Optional)

### 7.1 Frontend Domain (Vercel)

1. Go to Vercel → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

### 7.2 Backend Domain (Railway)

1. Go to Railway → Settings → Domains
2. Add custom domain
3. Update DNS with CNAME record

### 7.3 Update CORS

Don't forget to add custom domains to `ALLOWED_ORIGINS` in backend!

---

## Step 8: Test Production Deployment

### 8.1 Backend Health Check

Visit: `https://your-backend.up.railway.app/healthz`

Should return:
```json
{
  "db": true,
  "build": "production-v1.0.0",
  "routes": [...]
}
```

### 8.2 Frontend Test

1. Visit your frontend URL
2. Try signing in with Google
3. Send a test message
4. Check Focus Mode functionality

### 8.3 Payment Test

1. Use Stripe test cards
2. Test card: `4242 4242 4242 4242`
3. Expiry: Any future date
4. CVC: Any 3 digits

---

## Monitoring and Logs

### Railway Logs

```bash
railway logs
```

Or view in dashboard → Deployments → Logs

### Vercel Logs

Dashboard → Deployments → Select deployment → Logs

### Supabase Logs

Dashboard → Logs

---

## Troubleshooting

### Backend Won't Start

1. Check Railway logs for errors
2. Verify all environment variables are set
3. Check Python version (must be 3.12+)

### Frontend Can't Connect to Backend

1. Verify CORS settings in backend
2. Check backend URL is correct
3. Ensure backend is running (health check)

### Auth Issues

1. Verify Supabase credentials
2. Check Google OAuth redirect URIs
3. Clear browser cookies and retry

### Stripe Webhooks Not Working

1. Verify webhook URL is correct
2. Check webhook secret matches
3. Test webhook in Stripe dashboard

---

## Production Checklist

- [ ] Supabase project created
- [ ] Database schema applied
- [ ] Google OAuth configured
- [ ] Anthropic API key obtained
- [ ] Stripe products created
- [ ] Stripe webhook configured
- [ ] Backend deployed to Railway
- [ ] Backend environment variables set
- [ ] Backend health check passes
- [ ] Frontend deployed to Vercel
- [ ] Frontend environment variables set
- [ ] CORS configured correctly
- [ ] Custom domains configured (optional)
- [ ] Test signup and login
- [ ] Test chat functionality
- [ ] Test Focus Mode
- [ ] Test subscription checkout
- [ ] Monitor logs for errors

---

## Scaling Considerations

### Backend Scaling

Railway auto-scales based on traffic. For custom scaling:
- Go to Settings → Resources
- Adjust memory and CPU allocations

### Database Scaling

Supabase auto-scales. For high traffic:
- Upgrade to Pro plan
- Enable connection pooling
- Add read replicas

### Cost Optimization

- Monitor Anthropic API usage
- Set up usage alerts in Stripe
- Cache frequent queries
- Optimize database indexes

---

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Rotate API keys** - Every 90 days
3. **Enable 2FA** - On all service accounts
4. **Monitor logs** - Check for suspicious activity
5. **Keep dependencies updated** - Run `npm audit` and `pip audit`
6. **Use HTTPS only** - Enforce SSL/TLS
7. **Rate limit API** - Prevent abuse
8. **Backup database** - Daily automated backups

---

## Support

For deployment issues:
- Railway: https://railway.app/help
- Vercel: https://vercel.com/support
- Supabase: https://supabase.com/docs
- Stripe: https://support.stripe.com

---

**Your PUMi app is now live! 🚀**
