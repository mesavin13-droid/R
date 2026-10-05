-- ROADLIVE chat persistence and reaction integrity
-- Server writes with Supabase service_role after Telegram authentication.

BEGIN;

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(100) NOT NULL UNIQUE,
  channel_id VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  telegram_user_id BIGINT NOT NULL,
  author_name VARCHAR(100),
  content VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON chat_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_telegram_user
  ON chat_messages(telegram_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, telegram_user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON chat_reactions(message_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;

-- No public/client policies. Browser clients must use the authenticated server API.
REVOKE ALL ON TABLE chat_messages FROM anon, authenticated;
REVOKE ALL ON TABLE chat_reactions FROM anon, authenticated;

COMMIT;
