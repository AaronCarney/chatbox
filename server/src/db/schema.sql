-- Apps table: registry of approved third-party applications
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description_for_model TEXT,
  iframe_url TEXT,
  tools JSONB,
  auth_type TEXT DEFAULT 'none',
  oauth_config JSONB,
  trust_safety JSONB,
  sandbox_permissions TEXT[],
  status TEXT DEFAULT 'approved',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table: ephemeral context and chat history
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  session_pseudonym TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_call_id TEXT,
  app_id TEXT,
  data_classification TEXT DEFAULT 'ephemeral_context',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient session lookups
CREATE INDEX IF NOT EXISTS chat_messages_session_pseudonym_idx 
  ON chat_messages(session_pseudonym);
