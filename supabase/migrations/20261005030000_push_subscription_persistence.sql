-- ROADLIVE: align Web Push persistence with the server-side subscription model
-- The server stores the complete PushSubscription JSON so subscriptions survive restarts.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS subscription JSONB,
  ADD COLUMN IF NOT EXISTS district_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE push_subscriptions
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

UPDATE push_subscriptions
SET subscription = jsonb_build_object(
  'endpoint', endpoint,
  'keys', jsonb_build_object(
    'p256dh', p256dh,
    'auth', auth
  )
)
WHERE subscription IS NULL
  AND p256dh IS NOT NULL
  AND auth IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_district_id
  ON push_subscriptions(district_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Browser clients must never read/write push subscriptions directly.
-- The server uses the Supabase service role for these operations.
REVOKE ALL ON TABLE push_subscriptions FROM anon, authenticated;
