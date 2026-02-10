# PUMi Frontend

React + TypeScript frontend for the PUMi self-improvement app.

## Features

- **Two personality modes**: GenZ (direct, minimal) and Millennial (thoughtful, detailed)
- **Focus Mode**: Structured 45-minute learning sessions with interactive lessons
- **Real-time chat**: AI-powered conversations with memory
- **Multi-language support**: Hungarian and English
- **Responsive design**: Mobile-first, works on all devices
- **Dark mode**: Automatic theme switching
- **Authentication**: Supabase Auth (Google Sign-In)
- **Billing**: Stripe integration for subscriptions

## Tech Stack

- **Framework**: Vite + React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **State Management**: React Context + Hooks
- **Auth**: Supabase Auth
- **Backend**: FastAPI (see ../backend)
- **Deployment**: Vercel / Netlify / Any static host

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env` to `.env.local` and update if needed:

```bash
cp .env .env.local
```

Required environment variables:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key_here
VITE_SUPABASE_PROJECT_ID=your_project_id
```

### 3. Run development server

```bash
npm run dev
```

Visit `http://localhost:5173`

### 4. Build for production

```bash
npm run build
```

The optimized production build will be in the `dist/` folder.

## Project Structure

```
frontend/
├── src/
│   ├── components/       # React components
│   │   ├── auth/        # Authentication components
│   │   ├── chat/        # Chat interface components
│   │   ├── focus/       # Focus mode components
│   │   └── ui/          # shadcn/ui base components
│   ├── pages/           # Page components (routes)
│   ├── context/         # React Context providers
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utilities and i18n
│   ├── integrations/    # Supabase client
│   ├── types/           # TypeScript types
│   └── utils/           # Helper functions
├── public/              # Static assets
├── index.html           # HTML entry point
├── vite.config.ts       # Vite configuration
└── tailwind.config.ts   # Tailwind CSS config
```

## Key Features

### Focus Mode

Interactive 45-minute learning sessions with:
- Structured lesson plans
- Interactive quizzes
- Practice exercises (translation, roleplay, writing)
- Progress tracking
- Daily streak system

### Chat Interface

- Real-time AI conversations
- Persistent memory across sessions
- Image upload support
- Session management
- Mobile-optimized UI

### Authentication

- Google Sign-In via Supabase
- Protected routes
- Automatic session management
- Account deletion flow

### Billing

- Stripe checkout integration
- Subscription tier management (GenZ, Millennial)
- Customer portal access

## Development

### Adding new components

```bash
npx shadcn-ui@latest add [component-name]
```

### Code style

This project uses ESLint for linting. Run:

```bash
npm run lint
```

### Testing

```bash
npm run test
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repo to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Netlify

1. Build command: `npm run build`
2. Publish directory: `dist`
3. Add environment variables in Netlify dashboard

### Manual deployment

```bash
npm run build
# Upload dist/ folder to your hosting provider
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key | Yes |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ID | Yes |

## License

Proprietary - PUMi App
