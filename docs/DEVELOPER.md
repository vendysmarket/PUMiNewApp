# Developer Guide

Guide for developers working on PUMi.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Backend Development](#backend-development)
- [Frontend Development](#frontend-development)
- [Common Tasks](#common-tasks)
- [Testing](#testing)
- [Code Style](#code-style)
- [Debugging](#debugging)

---

## Architecture Overview

### High-Level Architecture

```
┌───────────────────────────────────────┐
│          Frontend (React)             │
│  - Vite + TypeScript                  │
│  - Tailwind CSS                       │
│  - shadcn/ui components               │
└──────────────┬────────────────────────┘
               │ HTTP/REST
               ↓
┌───────────────────────────────────────┐
│        Backend (FastAPI)              │
│  - Python 3.12                        │
│  - Claude API integration             │
│  - Session management                 │
└──────────────┬────────────────────────┘
               │
      ┌────────┴──────────┐
      │                   │
      ↓                   ↓
┌──────────┐      ┌──────────────┐
│ Supabase │      │ Anthropic    │
│ - Auth   │      │ - Claude API │
│ - DB     │      └──────────────┘
└──────────┘
```

### Key Design Patterns

**Backend:**
- FastAPI routers for endpoint organization
- Dependency injection for shared resources
- Pydantic models for validation
- Async/await for I/O operations

**Frontend:**
- React Context for global state
- Custom hooks for reusable logic
- Component composition
- TypeScript for type safety

---

## Backend Development

### Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app & routing
│   ├── llm_client.py             # Claude API client
│   ├── chat_enhanced.py          # Chat endpoint
│   ├── focus_api.py              # Focus Mode API
│   ├── focus_content_generators.py  # AI content generation
│   ├── billing.py                # Stripe integration
│   ├── account.py                # Account management
│   ├── db.py                     # Supabase client
│   ├── memory_store.py           # Conversation memory
│   ├── schemas.py                # Pydantic models
│   └── tools.py                  # Optional AI tools
├── requirements.txt
└── start.py
```

### Adding a New Endpoint

1. **Create router** in appropriate module:

```python
# app/my_feature.py
from fastapi import APIRouter, HTTPException
from .schemas import MyRequest, MyResponse

router = APIRouter(prefix="/my-feature", tags=["my_feature"])

@router.post("/action", response_model=MyResponse)
async def my_action(request: MyRequest):
    # Implementation
    return MyResponse(...)
```

2. **Define schemas** in `schemas.py`:

```python
from pydantic import BaseModel

class MyRequest(BaseModel):
    param: str

class MyResponse(BaseModel):
    result: str
```

3. **Register router** in `main.py`:

```python
from .my_feature import router as my_feature_router

app.include_router(my_feature_router)
```

### Working with Claude API

**Basic chat:**

```python
from app.llm_client import claude_chat_answer

response = await claude_chat_answer(
    message="User's message",
    lang="hu",
    tier="genz",
    memory_block="Previous context...",
    history=[
        {"role": "user", "content": "Previous message"},
        {"role": "assistant", "content": "Previous response"}
    ]
)
```

**Customizing personality:**

Edit `_genz_system()` or `_millenial_system()` in `llm_client.py`:

```python
def _genz_system(*, lang: str) -> str:
    if lang.startswith("hu"):
        return (
            "Te PUMi vagy, ...\n"
            "Új szabály: ...\n"
        )
    else:
        return (
            "You are PUMi, ...\n"
            "New rule: ...\n"
        )
```

### Database Operations

**Query example:**

```python
from app.db import supabase

# Select
result = supabase.table("focus_plans").select("*").eq("user_id", user_id).execute()
plans = result.data

# Insert
result = supabase.table("focus_plans").insert({
    "user_id": user_id,
    "title": "My Plan"
}).execute()

# Update
result = supabase.table("focus_plans").update({
    "status": "completed"
}).eq("id", plan_id).execute()

# Delete
result = supabase.table("focus_plans").delete().eq("id", plan_id).execute()
```

---

## Frontend Development

### Project Structure

```
frontend/src/
├── components/
│   ├── auth/              # Authentication
│   ├── chat/              # Chat interface
│   ├── focus/             # Focus mode
│   └── ui/                # Base UI components (shadcn)
├── pages/                 # Route pages
├── context/               # React Context
├── hooks/                 # Custom hooks
├── lib/                   # Utilities & i18n
├── integrations/          # Supabase client
├── types/                 # TypeScript types
└── utils/                 # Helper functions
```

### Adding a New Component

1. **Create component file:**

```typescript
// src/components/my-feature/MyComponent.tsx
import { useState } from 'react';

interface MyComponentProps {
  data: string;
}

export const MyComponent = ({ data }: MyComponentProps) => {
  const [state, setState] = useState('');

  return (
    <div className="p-4">
      <h2>{data}</h2>
    </div>
  );
};
```

2. **Use component:**

```typescript
import { MyComponent } from '@/components/my-feature/MyComponent';

function Page() {
  return <MyComponent data="Hello" />;
}
```

### Adding a New Page

1. **Create page component:**

```typescript
// src/pages/MyPage.tsx
export default function MyPage() {
  return (
    <div>
      <h1>My Page</h1>
    </div>
  );
}
```

2. **Add route** in `App.tsx`:

```typescript
import MyPage from './pages/MyPage';

<Route path="/my-page" element={<MyPage />} />
```

### Working with Supabase

**Authentication:**

```typescript
import { supabase } from '@/integrations/supabase/client';

// Sign in
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
});

// Get user
const { data: { user } } = await supabase.auth.getUser();

// Sign out
await supabase.auth.signOut();
```

**Database queries:**

```typescript
// Select
const { data, error } = await supabase
  .from('focus_plans')
  .select('*')
  .eq('user_id', userId);

// Insert
const { data, error } = await supabase
  .from('focus_plans')
  .insert({ user_id: userId, title: 'Plan' });

// Update
const { data, error } = await supabase
  .from('focus_plans')
  .update({ status: 'completed' })
  .eq('id', planId);
```

### Adding Translations

Edit `src/lib/i18n.ts`:

```typescript
export const translations = {
  hu: {
    myKey: "Magyar szöveg",
    // ...
  },
  en: {
    myKey: "English text",
    // ...
  }
};
```

Use in component:

```typescript
import { useTranslation } from '@/hooks/useTranslation';

function MyComponent() {
  const { t } = useTranslation();
  return <div>{t('myKey')}</div>;
}
```

---

## Common Tasks

### Adding a New Personality Tier

1. **Backend** - Update `llm_client.py`:

```python
def _premium_system(*, lang: str) -> str:
    if lang.startswith("hu"):
        return "Te PUMi vagy, PREMIUM tier..."
    else:
        return "You are PUMi, PREMIUM tier..."

# Add to claude_chat_answer:
if tier_norm == "premium":
    system = _premium_system(lang=lang_norm)
```

2. **Frontend** - Add tier to types:

```typescript
// types/user.ts
export type UserTier = 'free' | 'genz' | 'millennial' | 'premium';
```

3. **Database** - Update check constraint:

```sql
ALTER TABLE user_profiles 
DROP CONSTRAINT user_profiles_tier_check;

ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_tier_check 
CHECK (tier IN ('free', 'genz', 'millennial', 'premium'));
```

### Adding a New Focus Item Type

1. **Backend** - Update `focus_content_generators.py`:

```python
async def generate_my_new_type(
    title: str,
    lang: str = "hu",
    tier: str = "genz"
) -> Dict[str, Any]:
    # Generate content with Claude
    return {
        "type": "my_new_type",
        "content": "..."
    }
```

2. **Frontend** - Create renderer:

```typescript
// components/focus/renderers/MyNewTypeRenderer.tsx
export const MyNewTypeRenderer = ({ content, onComplete }) => {
  // Render interactive component
  return <div>...</div>;
};
```

3. **Database** - Update enum:

```sql
ALTER TABLE focus_items
DROP CONSTRAINT focus_items_kind_check;

ALTER TABLE focus_items
ADD CONSTRAINT focus_items_kind_check
CHECK (kind IN ('lesson', 'quiz', 'my_new_type', ...));
```

---

## Testing

### Backend Testing

```bash
cd backend
pytest
```

Example test:

```python
# tests/test_chat.py
import pytest
from app.llm_client import claude_chat_answer

@pytest.mark.asyncio
async def test_chat_response():
    response = await claude_chat_answer(
        message="Test",
        lang="hu",
        tier="genz"
    )
    assert len(response) > 0
```

### Frontend Testing

```bash
cd frontend
npm test
```

Example test:

```typescript
// src/components/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

test('renders component', () => {
  render(<MyComponent data="test" />);
  expect(screen.getByText('test')).toBeInTheDocument();
});
```

---

## Code Style

### Backend (Python)

- Follow PEP 8
- Use type hints
- Format with `black`
- Lint with `ruff`

```bash
# Format
black app/

# Lint
ruff check app/
```

### Frontend (TypeScript)

- Follow ESLint rules
- Use TypeScript types
- Format with Prettier

```bash
# Lint
npm run lint

# Format
npm run format
```

---

## Debugging

### Backend Debugging

**Print debugging:**

```python
print(f"[DEBUG] Variable: {value}")
```

**Use debugger:**

```python
import pdb; pdb.set_trace()
```

**Check logs:**

```bash
python start.py
# Logs print to stdout
```

### Frontend Debugging

**Console logging:**

```typescript
console.log('Debug:', value);
```

**React DevTools:**
- Install React DevTools browser extension
- Inspect component state and props

**Network debugging:**
- Open browser DevTools → Network tab
- Check API requests/responses

---

## Performance Tips

### Backend

- Use async/await for I/O operations
- Cache frequent queries
- Use database indexes
- Batch database operations
- Monitor API usage

### Frontend

- Lazy load components:
  ```typescript
  const MyComponent = lazy(() => import('./MyComponent'));
  ```
- Memoize expensive calculations:
  ```typescript
  const result = useMemo(() => expensive(), [deps]);
  ```
- Debounce user input:
  ```typescript
  const debouncedValue = useDebounce(value, 500);
  ```

---

## Useful Commands

### Backend

```bash
# Start dev server
python start.py

# Install dependencies
pip install -r requirements.txt

# Check types
mypy app/

# Run tests
pytest
```

### Frontend

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview build
npm run preview

# Lint
npm run lint

# Type check
npm run type-check
```

---

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [React Documentation](https://react.dev)
- [Anthropic API Reference](https://docs.anthropic.com)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)

---

Happy coding! 🚀
