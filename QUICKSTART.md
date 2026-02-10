# PUMi Quick Start Guide

Get PUMi running locally in 5 minutes!

## Prerequisites

- Node.js 18+ 
- Python 3.12+
- Git

## 1. Clone & Setup (1 min)

```bash
git clone <your-repo-url>
cd pumi-app
chmod +x setup.sh
./setup.sh
```

This will:
- Install backend Python dependencies
- Install frontend npm packages
- Create `.env` templates

## 2. Get API Keys (2 min)

### Anthropic Claude API (Required)
1. Go to https://console.anthropic.com
2. Create API key
3. Copy key (starts with `sk-ant-`)

### Supabase (Required)
1. Go to https://supabase.com
2. Create new project
3. Go to Settings → API
4. Copy:
   - Project URL
   - `anon` public key
   - `service_role` key

## 3. Configure (1 min)

Edit `backend/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Edit `frontend/.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
```

## 4. Setup Database (1 min)

In Supabase dashboard:
1. Go to SQL Editor
2. Paste the schema from `docs/database-schema.sql`
3. Run it

Or use the quick schema:

```sql
-- Minimal schema for testing
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  tier TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 5. Run! (30 sec)

**Terminal 1 - Backend:**
```bash
cd backend
python start.py
```

Backend runs on `http://localhost:8000`

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

## 6. Test It!

1. Open http://localhost:5173
2. Click "Sign in with Google"
3. Send a message: "Hi PUMi!"
4. Try Focus Mode (click Focus button)

## Common Issues

### "Module not found" errors

Backend:
```bash
cd backend
pip install -r requirements.txt
```

Frontend:
```bash
cd frontend
npm install
```

### "Database connection failed"

- Check Supabase URL and keys in `.env`
- Verify database schema is created
- Check network connection

### "Anthropic API error"

- Verify API key is correct
- Check you have credits in Anthropic account
- Try a different model in `.env`:
  ```bash
  CLAUDE_MODEL_HAIKU=claude-3-haiku-20240307
  ```

### Port already in use

Backend (change port):
```bash
python start.py --port 8001
```

Frontend (change port):
```bash
npm run dev -- --port 5174
```

## What's Next?

- **Full deployment guide**: See `docs/DEPLOYMENT.md`
- **API documentation**: Visit `http://localhost:8000/docs`
- **Architecture overview**: See main `README.md`

## Need Help?

1. Check logs in terminal
2. Review `docs/DEPLOYMENT.md`
3. Create GitHub issue

---

**You're ready to develop! 🎉**

Try:
- Modifying personality prompts in `backend/app/llm_client.py`
- Customizing UI in `frontend/src/components/`
- Adding new Focus Mode types in `backend/app/focus_api.py`
