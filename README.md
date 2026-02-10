# PUMi App

**PUMi** is a Gen Z and Millennial-focused self-improvement app with AI-powered conversations and structured learning sessions.

![PUMi Logo](frontend/public/pumi-logo.png)

## What is PUMi?

PUMi offers two distinct AI personalities tailored to different generations:

### GenZ Mode 🔥
- **Direct, no-BS communication**
- Short responses (2-4 sentences, under 200 chars)
- Challenges you with tough questions
- No empty motivation - real accountability
- Perfect for: Quick check-ins, accountability nudges, staying on track

### Millennial Mode 💼
- **Thoughtful, professional tone**
- Detailed responses (3-5 sentences, ~300 chars)
- Balanced encouragement with practical advice
- Clear action steps when needed
- Perfect for: Complex problems, career planning, deeper reflection

## Core Features

### 💪 Focus Mode
45-minute structured learning sessions with:
- Interactive lessons
- Quizzes and practice exercises
- Daily streak tracking
- Multi-language support (Hungarian, English)
- Progress persistence

### 💬 AI Chat
- Real-time conversations with persistent memory
- Context-aware responses
- Image upload support
- Session management
- Mobile-optimized interface

### 🔐 Authentication
- Google Sign-In via Supabase
- Secure session management
- Protected routes
- Account deletion flow

### 💳 Subscriptions
Two premium tiers:
- **GenZ**: 25,000 tokens/day
- **Millennial**: 40,000 tokens/day
- Stripe integration for payments

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- Supabase Auth
- i18n (Hungarian/English)

### Backend
- Python 3.12
- FastAPI
- Claude API (Anthropic)
- Supabase (PostgreSQL)
- Stripe

## Project Structure

```
pumi-app/
├── frontend/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── lib/
│   ├── public/
│   └── package.json
├── backend/           # FastAPI backend
│   ├── app/
│   │   ├── main.py
│   │   ├── llm_client.py
│   │   ├── focus_api.py
│   │   └── ...
│   ├── requirements.txt
│   └── start.py
├── docs/              # Documentation
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.12+
- Supabase account
- Anthropic API key
- Stripe account (for billing)

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd pumi-app
```

### 2. Setup Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your credentials
python start.py
```

Backend runs on `http://localhost:8000`

### 3. Setup Frontend

```bash
cd frontend
npm install
cp .env .env.local
# Edit .env.local if needed
npm run dev
```

Frontend runs on `http://localhost:5173`

### 4. Setup Supabase

Required tables:
- `user_profiles`
- `focus_plans`
- `focus_days`
- `focus_items`
- `focus_item_progress`
- `user_focus_stats`

See `docs/database-schema.sql` for full schema.

## Deployment

### Backend (Railway)

1. Create new project on Railway
2. Connect GitHub repo
3. Set root directory to `backend/`
4. Add environment variables
5. Deploy

### Frontend (Vercel)

1. Connect GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Build command: `npm run build`
4. Output directory: `dist`
5. Add environment variables
6. Deploy

## Configuration

### Backend Environment Variables

```bash
# Claude API
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL_SONNET=claude-sonnet-4-20250514
CLAUDE_MODEL_HAIKU=claude-3-haiku-20240307

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_GENZ=price_...
STRIPE_PRICE_ID_MILLENNIAL=price_...
```

### Frontend Environment Variables

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
VITE_SUPABASE_PROJECT_ID=xxx
```

## Development

### Backend Development

```bash
cd backend
python start.py
# API docs: http://localhost:8000/docs
```

### Frontend Development

```bash
cd frontend
npm run dev
# App: http://localhost:5173
```

### API Endpoints

- `GET /healthz` - Health check
- `POST /chat_enhanced/answer` - Chat endpoint
- `POST /focus/create` - Create focus plan
- `GET /focus/plans` - List focus plans
- `POST /account/delete` - Delete account
- See `/docs` for full API documentation

## Features in Development

- [ ] Voice mode
- [ ] Advanced analytics
- [ ] Social features (sharing progress)
- [ ] Mobile apps (iOS/Android)
- [ ] Additional languages

## Contributing

This is a proprietary project. Contact the maintainers for contribution guidelines.

## License

Proprietary - All rights reserved

## Support

For issues or questions:
- Email: support@pumi.app (placeholder)
- GitHub Issues: Create an issue in this repo

---

**Built with ❤️ for personal growth and accountability**
