-- Driver last-known positions for radius-targeted push/TG notifications.
-- Updated by the client heartbeat (POST /api/drivers/location). Service-role only.
CREATE TABLE IF NOT EXISTS driver_locations (
  telegram_id BIGINT PRIMARY KEY,
  user_id TEXT,
  last_lat DOUBLE PRECISION,
  last_lng DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE driver_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE driver_locations FROM anon, authenticated;
GRANT ALL ON TABLE driver_locations TO service_role;

-- Push subscriptions may carry the last known position too (web-push path).
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
