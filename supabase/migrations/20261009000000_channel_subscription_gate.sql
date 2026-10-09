-- ROADLIVE: mandatory channel subscription gate.
--
-- Goal:
--   * Before a driver can interact with the map, they must subscribe to a channel
--     chosen by the owner. The server verifies the membership through the
--     Telegram Bot API (getChatMember), never through the browser.
--   * The channel itself is owner-configurable and lives in the database, so the
--     owner can change it from the admin panel without a redeploy.
--   * The table is server-only, matching the RBAC policy used by the website and
--     advertising tables: anon/authenticated have no access at all.
--
-- chat_id is the value passed to getChatMember: "@username" for public channels
-- or "-100..." id for private ones. link is what the "Open channel" button opens.
-- A private channel MUST have an explicit chat_id because its join link cannot be
-- converted back into an id.

CREATE TABLE IF NOT EXISTS public.channel_gate_config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  chat_id TEXT NOT NULL,
  username TEXT,
  link TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT channel_gate_config_single_row CHECK (id = 1)
);

ALTER TABLE public.channel_gate_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.channel_gate_config FROM anon, authenticated;
GRANT ALL ON public.channel_gate_config TO service_role;

DROP TRIGGER IF EXISTS channel_gate_config_touch_updated_at ON public.channel_gate_config;
CREATE TRIGGER channel_gate_config_touch_updated_at
  BEFORE UPDATE ON public.channel_gate_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();