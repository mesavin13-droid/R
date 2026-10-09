-- ROADLIVE: align Web Push persistence with the server-side subscription model.
--
-- The browser only ever hands the server a PushSubscription object. The server
-- stores the complete JSON so that a subscription survives restarts and can be
-- replayed by web-push without asking the device again.
--
-- Table shape comes from 0400 (p256dh/auth NOT NULL). This migration relaxes those
-- columns to nullable, adds the JSON payload used by the server, and backfills the
-- payload for rows written by the earlier column-based model.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS subscription JSONB,
  ADD COLUMN IF NOT EXISTS district_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- The NOT NULL drops are guarded: an installation that was created from a variant
-- schema without these columns must not fail this migration.
DO $$
DECLARE
  has_p256dh BOOLEAN;
  has_auth BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'p256dh'
  ) INTO has_p256dh;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'auth'
  ) INTO has_auth;

  IF has_p256dh THEN
    EXECUTE 'ALTER TABLE public.push_subscriptions ALTER COLUMN p256dh DROP NOT NULL';
  END IF;
  IF has_auth THEN
    EXECUTE 'ALTER TABLE public.push_subscriptions ALTER COLUMN auth DROP NOT NULL';
  END IF;
END $$;

-- Backfill only when the legacy columns are actually present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'p256dh'
  ) THEN
    UPDATE public.push_subscriptions
    SET subscription = jsonb_build_object(
      'endpoint', endpoint,
      'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)
    )
    WHERE subscription IS NULL
      AND p256dh IS NOT NULL
      AND auth IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_district_id
  ON public.push_subscriptions(district_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Browser clients must never read or write push subscriptions directly.
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
