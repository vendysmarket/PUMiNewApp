# Environment Variables Reference

Complete reference for all environment variables used in PUMi.

## Backend Environment Variables

Location: `backend/.env`

### Required Variables

#### Anthropic API
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
```
- **Description**: Your Claude API key from Anthropic
- **Where to get**: https://console.anthropic.com
- **Required**: Yes
- **Example**: `sk-ant-api03-xxxxxxxxxxxxxxxxxxxxx`

#### Claude Models
```bash
CLAUDE_MODEL_SONNET=claude-sonnet-4-20250514
CLAUDE_MODEL_HAIKU=claude-3-haiku-20240307
```
- **Description**: Claude model versions to use
- **Required**: No (has defaults)
- **Defaults**: Sonnet 4, Haiku 3
- **Notes**: 
  - Sonnet: High-quality conversational responses (~300 tokens)
  - Haiku: Fast JSON generation (cheaper but higher token usage)

#### Supabase
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
- **Description**: Supabase connection credentials
- **Where to get**: Supabase Dashboard → Settings → API
- **Required**: Yes
- **Notes**: 
  - `SUPABASE_URL`: Your project URL
  - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (admin access)
  - `SUPABASE_SERVICE_KEY`: Alias for service role key
  - Both keys should be the same value

### Optional Variables

#### Stripe (for billing)
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_GENZ=price_...
STRIPE_PRICE_ID_MILLENNIAL=price_...
```
- **Description**: Stripe payment integration
- **Where to get**: Stripe Dashboard → Developers → API keys
- **Required**: No (only for production billing)
- **Notes**: 
  - Use test keys (`sk_test_`) for development
  - Webhook secret from Stripe → Webhooks settings
  - Price IDs from Stripe → Products

#### Railway (for proxy mode)
```bash
RAILWAY_TOKEN=your_railway_token
```
- **Description**: Railway internal authentication token
- **Required**: No
- **Use case**: Internal service-to-service auth
- **Notes**: Only needed if using Railway proxy authentication

#### Build Info
```bash
BUILD_TAG=production-v1.0.0
```
- **Description**: Build version identifier
- **Required**: No
- **Default**: Auto-generated
- **Use case**: Tracking deployments

---

## Frontend Environment Variables

Location: `frontend/.env` or `frontend/.env.local`

### Required Variables

#### Supabase
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=xxxxx
```
- **Description**: Supabase client configuration
- **Where to get**: Supabase Dashboard → Settings → API
- **Required**: Yes
- **Notes**: 
  - `VITE_SUPABASE_URL`: Same as backend
  - `VITE_SUPABASE_PUBLISHABLE_KEY`: The `anon` public key (NOT service role!)
  - `VITE_SUPABASE_PROJECT_ID`: Project ID from URL (the part before `.supabase.co`)

---

## Environment-Specific Configurations

### Development

**Backend** (`backend/.env`):
```bash
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
BUILD_TAG=dev-local
```

**Frontend** (`frontend/.env.local`):
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
VITE_SUPABASE_PROJECT_ID=xxxxx
```

### Production

**Backend** (Railway environment variables):
```bash
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL_SONNET=claude-sonnet-4-20250514
CLAUDE_MODEL_HAIKU=claude-3-haiku-20240307
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_GENZ=price_...
STRIPE_PRICE_ID_MILLENNIAL=price_...
BUILD_TAG=production-v1.0.0
```

**Frontend** (Vercel environment variables):
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
VITE_SUPABASE_PROJECT_ID=xxxxx
```

---

## Security Best Practices

### ✅ DO:
- Store secrets in `.env` files (gitignored)
- Use different credentials for dev/staging/prod
- Rotate API keys every 90 days
- Use environment variables in CI/CD
- Grant minimum required permissions

### ❌ DON'T:
- Commit `.env` files to git
- Share secrets in chat/email
- Use production keys in development
- Expose service role keys in frontend
- Store secrets in code

---

## Validation Checklist

### Backend Health Check
```bash
curl http://localhost:8000/healthz
```

Should return:
```json
{
  "db": true,
  "build": "...",
  "routes": [...]
}
```

If `"db": false`:
- Check `SUPABASE_URL`
- Check `SUPABASE_SERVICE_ROLE_KEY`
- Verify Supabase project is active

### Frontend Connection Test
1. Open browser console
2. Navigate to http://localhost:5173
3. Check for errors in console
4. Try Google Sign-In

Common errors:
- `Invalid API key`: Check `VITE_SUPABASE_PUBLISHABLE_KEY`
- `CORS error`: Check backend CORS settings
- `Network error`: Check backend is running

---

## Troubleshooting

### "Invalid API key" (Anthropic)
- Verify key format: `sk-ant-api03-...`
- Check key is active in Anthropic console
- Verify you have credits

### "Supabase connection failed"
- Check URL format: `https://xxx.supabase.co`
- Verify service role key is correct
- Check project is not paused

### "Stripe webhook failed"
- Verify webhook secret matches Stripe dashboard
- Check endpoint URL is correct
- Test webhook in Stripe dashboard

### "CORS error"
- Check frontend URL is in backend `ALLOWED_ORIGINS`
- Verify no trailing slashes in URLs
- Check protocol (http vs https)

---

## Quick Reference

### Get All Required Keys

1. **Anthropic API**
   - https://console.anthropic.com → Create Key

2. **Supabase**
   - https://supabase.com → Your Project → Settings → API
   - Copy: URL, anon key, service_role key

3. **Stripe** (optional)
   - https://dashboard.stripe.com → Developers → API keys
   - Copy: Secret key, Create webhook → Copy webhook secret

### Verify Setup

```bash
# Backend
cd backend
python start.py
# Visit http://localhost:8000/docs

# Frontend
cd frontend
npm run dev
# Visit http://localhost:5173
```

---

## Support

Can't find what you need?
- Check `QUICKSTART.md` for basic setup
- See `DEPLOYMENT.md` for production setup
- Create GitHub issue for bugs
