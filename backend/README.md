# PUMi Backend

FastAPI backend for the PUMi self-improvement app.

## Features

- **Two personality tiers**: GenZ (direct, short) and Millennial (thoughtful, detailed)
- **Focus Mode**: 45-minute structured learning sessions
- **Memory system**: Persistent user context and conversation history
- **Billing**: Stripe integration for subscriptions
- **Authentication**: Supabase Auth integration

## Tech Stack

- FastAPI
- Claude API (Anthropic)
- Supabase (auth + database)
- Stripe (payments)
- PostgreSQL

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required credentials:
- `ANTHROPIC_API_KEY`: Your Claude API key from https://console.anthropic.com
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key from Supabase settings
- `STRIPE_SECRET_KEY`: Stripe secret key (for billing)

### 3. Run the server

Development mode:
```bash
python start.py
```

Production mode:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API Endpoints

### Health Check
- `GET /healthz` - Server health and registered routes

### Chat
- `POST /chat_enhanced/answer` - Main chat endpoint

### Focus Mode
- `POST /focus/create` - Create new focus plan
- `GET /focus/plans` - List user's focus plans
- `POST /focus/day/{day_id}/complete` - Complete a focus day

### Account
- `POST /account/delete` - Delete user account and all data

### Usage & Billing
- `GET /usage/daily` - Get daily token usage
- `POST /usage/commit` - Commit token usage
- `POST /billing/create-checkout` - Create Stripe checkout session

## Deployment

### Railway

1. Create new project on Railway
2. Add environment variables from `.env.example`
3. Deploy from GitHub or local directory

### Docker

```bash
docker build -t pumi-backend .
docker run -p 8000:8000 --env-file .env pumi-backend
```

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app initialization
│   ├── llm_client.py        # Claude API client + personality prompts
│   ├── chat_enhanced.py     # Chat endpoint with memory
│   ├── focus_api.py         # Focus mode endpoints
│   ├── focus_content_generators.py  # AI content generation for lessons
│   ├── billing.py           # Stripe integration
│   ├── account.py           # Account management
│   ├── db.py                # Supabase client
│   ├── memory_store.py      # Conversation memory
│   ├── schemas.py           # Pydantic models
│   └── tools.py             # Optional AI tools
├── requirements.txt
├── start.py
└── README.md
```

## License

Proprietary - PUMi App
