-- PUMi Database Schema
-- PostgreSQL / Supabase

-- =====================================================
-- USER PROFILES
-- =====================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'genz', 'millennial')),
  language TEXT DEFAULT 'hu' CHECK (language IN ('hu', 'en')),
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer ON user_profiles(stripe_customer_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FOCUS MODE
-- =====================================================

-- Focus Plans (top-level learning plans)
CREATE TABLE IF NOT EXISTS focus_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  focus_type TEXT NOT NULL CHECK (focus_type IN ('learning', 'project', 'skill')),
  subject TEXT,
  language TEXT DEFAULT 'hu' CHECK (language IN ('hu', 'en')),
  tier TEXT DEFAULT 'genz' CHECK (tier IN ('genz', 'millennial')),
  duration INTEGER DEFAULT 45 CHECK (duration > 0 AND duration <= 180),
  total_days INTEGER DEFAULT 7 CHECK (total_days > 0 AND total_days <= 365),
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_focus_plans_user_id ON focus_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_focus_plans_status ON focus_plans(status);
CREATE INDEX IF NOT EXISTS idx_focus_plans_user_status ON focus_plans(user_id, status);

-- Focus Days (daily sessions within a plan)
CREATE TABLE IF NOT EXISTS focus_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES focus_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL CHECK (day_number > 0),
  title TEXT,
  description TEXT,
  content JSONB,
  duration_minutes INTEGER DEFAULT 45,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_focus_days_plan_id ON focus_days(plan_id);
CREATE INDEX IF NOT EXISTS idx_focus_days_completed ON focus_days(completed);
CREATE INDEX IF NOT EXISTS idx_focus_days_plan_number ON focus_days(plan_id, day_number);

-- Focus Items (individual lessons, quizzes, practices within a day)
CREATE TABLE IF NOT EXISTS focus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID NOT NULL REFERENCES focus_days(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'lesson',
    'quiz',
    'translation',
    'roleplay',
    'writing',
    'flashcards',
    'practice',
    'reflection'
  )),
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  sequence INTEGER DEFAULT 0 CHECK (sequence >= 0),
  duration_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_focus_items_day_id ON focus_items(day_id);
CREATE INDEX IF NOT EXISTS idx_focus_items_kind ON focus_items(kind);
CREATE INDEX IF NOT EXISTS idx_focus_items_sequence ON focus_items(day_id, sequence);

-- Focus Item Progress (user completion tracking)
CREATE TABLE IF NOT EXISTS focus_item_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES focus_items(id) ON DELETE CASCADE,
  completed BOOLEAN DEFAULT false,
  score NUMERIC(5,2),
  response JSONB,
  time_spent_seconds INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_focus_item_progress_user ON focus_item_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_focus_item_progress_item ON focus_item_progress(item_id);
CREATE INDEX IF NOT EXISTS idx_focus_item_progress_completed ON focus_item_progress(completed);
CREATE INDEX IF NOT EXISTS idx_focus_item_progress_user_item ON focus_item_progress(user_id, item_id);

-- User Focus Statistics (streaks, totals)
CREATE TABLE IF NOT EXISTS user_focus_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak INTEGER DEFAULT 0 CHECK (longest_streak >= 0),
  total_days_completed INTEGER DEFAULT 0 CHECK (total_days_completed >= 0),
  total_minutes_spent INTEGER DEFAULT 0 CHECK (total_minutes_spent >= 0),
  last_completed_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_focus_stats_streak ON user_focus_stats(current_streak);
CREATE INDEX IF NOT EXISTS idx_user_focus_stats_last_completed ON user_focus_stats(last_completed_date);

-- =====================================================
-- CHAT & MEMORY
-- =====================================================

-- Chat Sessions (optional - for session grouping)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- Chat Messages (optional - for message history)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);

-- =====================================================
-- USAGE TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  text_tokens INTEGER DEFAULT 0 CHECK (text_tokens >= 0),
  voice_tokens INTEGER DEFAULT 0 CHECK (voice_tokens >= 0),
  total_tokens INTEGER DEFAULT 0 CHECK (total_tokens >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_user_date ON usage_daily(user_id, date);
CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(date);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_item_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_focus_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_daily ENABLE ROW LEVEL SECURITY;

-- User Profiles: Users can read/update their own profile
CREATE POLICY user_profiles_select ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Focus Plans: Users can manage their own plans
CREATE POLICY focus_plans_all ON focus_plans
  FOR ALL USING (auth.uid() = user_id);

-- Focus Days: Users can view days from their plans
CREATE POLICY focus_days_select ON focus_days
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM focus_plans
      WHERE focus_plans.id = focus_days.plan_id
      AND focus_plans.user_id = auth.uid()
    )
  );

-- Focus Items: Users can view items from their plan days
CREATE POLICY focus_items_select ON focus_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM focus_days
      JOIN focus_plans ON focus_plans.id = focus_days.plan_id
      WHERE focus_days.id = focus_items.day_id
      AND focus_plans.user_id = auth.uid()
    )
  );

-- Focus Item Progress: Users manage their own progress
CREATE POLICY focus_item_progress_all ON focus_item_progress
  FOR ALL USING (auth.uid() = user_id);

-- User Focus Stats: Users can read/update their own stats
CREATE POLICY user_focus_stats_all ON user_focus_stats
  FOR ALL USING (auth.uid() = user_id);

-- Chat Sessions: Users manage their own sessions
CREATE POLICY chat_sessions_all ON chat_sessions
  FOR ALL USING (auth.uid() = user_id);

-- Chat Messages: Users manage their own messages
CREATE POLICY chat_messages_all ON chat_messages
  FOR ALL USING (auth.uid() = user_id);

-- Usage Daily: Users can read their own usage
CREATE POLICY usage_daily_select ON usage_daily
  FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update streak on day completion
CREATE OR REPLACE FUNCTION update_user_streak()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed = true AND OLD.completed = false THEN
    -- Day was just completed
    INSERT INTO user_focus_stats (user_id, current_streak, longest_streak, total_days_completed, last_completed_date)
    VALUES (
      (SELECT user_id FROM focus_plans WHERE id = NEW.plan_id),
      1,
      1,
      1,
      CURRENT_DATE
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_days_completed = user_focus_stats.total_days_completed + 1,
      current_streak = CASE
        WHEN user_focus_stats.last_completed_date = CURRENT_DATE - INTERVAL '1 day'
        THEN user_focus_stats.current_streak + 1
        WHEN user_focus_stats.last_completed_date = CURRENT_DATE
        THEN user_focus_stats.current_streak
        ELSE 1
      END,
      longest_streak = GREATEST(
        user_focus_stats.longest_streak,
        CASE
          WHEN user_focus_stats.last_completed_date = CURRENT_DATE - INTERVAL '1 day'
          THEN user_focus_stats.current_streak + 1
          WHEN user_focus_stats.last_completed_date = CURRENT_DATE
          THEN user_focus_stats.current_streak
          ELSE 1
        END
      ),
      last_completed_date = CURRENT_DATE,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER focus_day_completed_trigger
AFTER UPDATE OF completed ON focus_days
FOR EACH ROW
EXECUTE FUNCTION update_user_streak();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_focus_plans_user_created ON focus_plans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_focus_days_plan_completed ON focus_days(plan_id, completed);
CREATE INDEX IF NOT EXISTS idx_focus_items_day_sequence ON focus_items(day_id, sequence);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(session_id, created_at DESC);

-- =====================================================
-- INITIAL DATA (Optional)
-- =====================================================

-- You can add default data here if needed
-- Example: Default system prompts, sample focus plans, etc.

-- =====================================================
-- NOTES
-- =====================================================

-- This schema is optimized for:
-- 1. Fast user queries (most common operation)
-- 2. Efficient focus mode navigation
-- 3. Real-time progress tracking
-- 4. Secure multi-tenant access via RLS
--
-- Performance tips:
-- - Use connection pooling (pgBouncer)
-- - Enable prepared statements
-- - Monitor query performance with pg_stat_statements
-- - Add indexes based on actual query patterns
