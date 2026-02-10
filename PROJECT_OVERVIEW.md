# PUMi Project Overview

## What is PUMi?

**PUMi** is a next-generation self-improvement app that uses AI to provide personalized, generation-specific coaching and structured learning experiences.

### Core Philosophy

Unlike traditional self-help apps that are:
- Overly positive and unrealistic
- Generic and one-size-fits-all
- Focused on feel-good platitudes

PUMi is:
- **Direct and honest** - No BS, real accountability
- **Generation-specific** - Tailored for GenZ and Millennials
- **Action-oriented** - Focused on doing, not just feeling

---

## Product Features

### 1. AI Chat (Two Personalities)

#### GenZ Mode 🔥
**Vibe**: Your brutally honest friend who calls you out

**Characteristics:**
- Ultra-short responses (2-4 sentences, <200 chars)
- Direct, challenging questions
- No empty motivation
- Accountability-focused
- Quick check-ins

**Example:**
```
User: "I want to start working out"
PUMi: "Cool. When's your first workout? Tomorrow morning? Or you just vibing rn?"
```

#### Millennial Mode 💼
**Vibe**: Your thoughtful career coach

**Characteristics:**
- Detailed responses (3-5 sentences, ~300 chars)
- Balanced and professional
- Practical advice
- Clear action steps
- Deeper reflection

**Example:**
```
User: "I want to start working out"
PUMi: "That's a solid goal. What's driving this? If it's health, morning workouts might work. 
If it's stress relief, evenings could be better. Start with 2-3 days/week to build the habit. 
What time works best for your schedule?"
```

### 2. Focus Mode

45-minute structured learning sessions with:

- **Interactive Lessons** - Bite-sized educational content
- **Quizzes** - Knowledge checks with instant feedback
- **Practice Exercises**:
  - Translation practice (language learning)
  - Roleplay scenarios (communication skills)
  - Writing prompts (reflection & creativity)
  - Flashcards (memorization)
- **Progress Tracking** - Daily streaks, completion stats
- **Persistence** - Resume where you left off

**Types of Focus Plans:**
- **Learning**: Language, skills, subjects
- **Project**: Complete a specific project
- **Skill**: Master a particular skill

### 3. Memory System

PUMi remembers:
- Previous conversations
- User preferences
- Learning progress
- Personal context

This enables:
- Continuity across sessions
- Personalized recommendations
- Context-aware responses

### 4. Subscription Tiers

| Feature | Free | GenZ | Millennial |
|---------|------|------|------------|
| Daily tokens | 4,000 | 25,000 | 40,000 |
| Focus Mode | ✓ | ✓ | ✓ |
| Memory | ✓ | ✓ | ✓ |
| Personality | GenZ only | GenZ | Both |
| Price | $0/month | $9/month | $14/month |

---

## Technical Architecture

### Tech Stack

**Frontend:**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- shadcn/ui (component library)
- Supabase Auth (authentication)

**Backend:**
- Python 3.12 + FastAPI
- Claude API (Anthropic)
- Supabase (PostgreSQL database)
- Stripe (payment processing)

**Infrastructure:**
- Railway (backend hosting)
- Vercel (frontend hosting)
- Supabase (managed database + auth)

### System Architecture

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────┐
│  Frontend (React + Vite)        │
│  - Chat interface               │
│  - Focus mode UI                │
│  - Auth flow                    │
│  - Subscription management      │
└────────────┬────────────────────┘
             │ REST API
             ↓
┌─────────────────────────────────┐
│  Backend (FastAPI)              │
│  ┌──────────────────────────┐  │
│  │ Chat Endpoint            │  │
│  │ - Memory integration     │  │
│  │ - Personality selection  │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ Focus API                │  │
│  │ - Content generation     │  │
│  │ - Progress tracking      │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │ Account Management       │  │
│  │ - User CRUD              │  │
│  │ - Data deletion          │  │
│  └──────────────────────────┘  │
└────────────┬────────────────────┘
             │
    ┌────────┴─────────┐
    │                  │
    ↓                  ↓
┌──────────┐     ┌────────────┐
│ Supabase │     │ Anthropic  │
│ - Auth   │     │ Claude API │
│ - DB     │     └────────────┘
└────┬─────┘
     │
     ↓
┌──────────┐
│ Stripe   │
│ Billing  │
└──────────┘
```

### Database Schema

**Core Tables:**
- `user_profiles` - User accounts and tier
- `focus_plans` - Learning plans
- `focus_days` - Daily sessions
- `focus_items` - Individual lessons/quizzes
- `focus_item_progress` - User completion tracking
- `user_focus_stats` - Streaks and statistics
- `usage_daily` - Token usage tracking

See `docs/database-schema.sql` for full schema.

---

## Development Workflow

### Local Setup

1. **Clone repo**
2. **Run setup script**: `./setup.sh`
3. **Configure environment**: Edit `.env` files
4. **Start backend**: `cd backend && python start.py`
5. **Start frontend**: `cd frontend && npm run dev`

### Development Cycle

1. **Feature branch**: `git checkout -b feature/my-feature`
2. **Develop locally**: Make changes
3. **Test**: Run tests and manual testing
4. **Commit**: `git commit -m "Add feature"`
5. **Push**: `git push origin feature/my-feature`
6. **Deploy**: Merge to main triggers auto-deployment

### Deployment

**Backend** (Railway):
- Auto-deploys on push to `main`
- Environment variables configured in Railway dashboard

**Frontend** (Vercel):
- Auto-deploys on push to `main`
- Environment variables configured in Vercel dashboard

---

## Key Design Decisions

### Why Two Personalities?

**GenZ** and **Millennials** have different communication preferences:

- **GenZ**: Prefer short, direct communication. Used to TikTok, Instagram. Value authenticity and directness.
- **Millennials**: Prefer detailed, thoughtful responses. Grew up with long-form content. Value professionalism and depth.

Having separate modes allows PUMi to speak each generation's language naturally.

### Why Focus Mode?

Traditional apps struggle with:
- Overwhelming users with too much content
- Lack of structure
- No clear progress markers

Focus Mode solves this by:
- Fixed 45-minute sessions (manageable commitment)
- Structured daily plans
- Clear progress tracking
- Interactive elements (not just passive reading)

### Why Claude API?

Claude (Anthropic) was chosen because:
- High-quality, nuanced responses
- Strong instruction following
- Good at personality consistency
- Reasonable pricing
- Fast response times

### Why Supabase?

Supabase provides:
- PostgreSQL database (powerful, reliable)
- Built-in authentication (Google OAuth)
- Real-time capabilities (future features)
- Row-level security (data protection)
- Generous free tier

---

## Product Roadmap

### Phase 1: MVP (Current)
- ✅ GenZ & Millennial chat modes
- ✅ Focus Mode (learning, project, skill)
- ✅ Google authentication
- ✅ Subscription tiers
- ✅ Progress tracking

### Phase 2: Enhancement (Q1 2026)
- [ ] Voice mode
- [ ] Advanced analytics dashboard
- [ ] Social features (share progress)
- [ ] More practice types
- [ ] Team/group features

### Phase 3: Scale (Q2 2026)
- [ ] Mobile apps (iOS/Android)
- [ ] Offline mode
- [ ] Additional languages (Spanish, French)
- [ ] API for third-party integrations
- [ ] B2B/Enterprise features

### Phase 4: Expand (Q3-Q4 2026)
- [ ] Wellness tracking integration
- [ ] Community features
- [ ] Expert coaching marketplace
- [ ] Custom personality training
- [ ] White-label solution

---

## Business Model

### Revenue Streams

1. **Subscriptions** (Primary)
   - GenZ: $9/month
   - Millennial: $14/month

2. **Future Revenue**
   - Enterprise/Team plans
   - API access for developers
   - White-label licensing

### Unit Economics (Estimated)

**Per User/Month:**
- Revenue: $9-14
- Claude API cost: ~$2-3
- Infrastructure: ~$0.50
- Gross margin: ~60-70%

### Market Opportunity

**Target Market:**
- GenZ: 68M in US, 2B globally
- Millennials: 72M in US, 1.8B globally

**Addressable Market:**
- Self-improvement app market: $1.5B/year
- EdTech market: $340B/year
- Mental wellness market: $130B/year

---

## Competition

### Direct Competitors
- **Replika** - AI companion (too focused on emotional support)
- **Pi** - AI assistant (too general-purpose)
- **Woebot** - Mental health chatbot (too clinical)

### Indirect Competitors
- **Duolingo** - Language learning (gamification focus)
- **Headspace** - Meditation (narrow focus)
- **BetterHelp** - Therapy (expensive, human-powered)

### PUMi's Advantages
1. **Generation-specific**: Actually speaks each generation's language
2. **Balanced approach**: Not too soft, not too harsh
3. **Action-oriented**: Focus on doing, not just feeling
4. **Affordable**: $9-14/month vs $200+/month for coaching
5. **Structured learning**: Focus Mode with real content

---

## Success Metrics

### Key Performance Indicators (KPIs)

**Growth:**
- Monthly Active Users (MAU)
- New signups/month
- Conversion rate (free → paid)

**Engagement:**
- Daily Active Users (DAU)
- Messages sent/user/day
- Focus sessions completed/week
- Session length

**Retention:**
- 30-day retention rate
- Churn rate
- Lifetime Value (LTV)

**Revenue:**
- Monthly Recurring Revenue (MRR)
- Average Revenue Per User (ARPU)
- Customer Acquisition Cost (CAC)
- LTV/CAC ratio

### Target Metrics (6 months)

- **Users**: 10,000 MAU
- **Conversion**: 15% free → paid
- **Retention**: 70% at 30 days
- **MRR**: $15,000
- **LTV/CAC**: 3:1

---

## Team & Roles

### Current Team
- **Founder/Developer**: Full-stack development, product vision

### Needed Roles (Future)
- **Product Manager**: Feature prioritization, user research
- **Designer**: UI/UX improvements, brand development
- **Marketing**: User acquisition, content creation
- **Customer Success**: User support, retention

---

## Legal & Compliance

### Privacy
- GDPR compliant (EU users)
- CCPA compliant (California users)
- Clear privacy policy
- User data deletion on request

### Terms of Service
- Age restriction: 13+ (with parental consent) or 18+
- Usage limits and fair use policy
- Subscription terms and cancellation
- Content moderation guidelines

### Intellectual Property
- PUMi brand and logo
- Proprietary personality prompts
- Custom content generation algorithms

---

## Resources

### Documentation
- `QUICKSTART.md` - Get started in 5 minutes
- `DEPLOYMENT.md` - Full production deployment
- `DEVELOPER.md` - Developer guide
- `ENVIRONMENT.md` - Environment variables reference

### Links
- **Frontend**: https://your-app.vercel.app
- **Backend**: https://your-app.railway.app
- **Supabase**: https://supabase.com/dashboard
- **Anthropic Console**: https://console.anthropic.com
- **Stripe Dashboard**: https://dashboard.stripe.com

---

## Support & Contact

- **Email**: support@pumi.app (placeholder)
- **GitHub**: [Your repo URL]
- **Documentation**: See `docs/` folder

---

**Last Updated**: February 10, 2026
**Version**: 1.0.0
