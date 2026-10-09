-- ROADLIVE: normalize push_subscriptions to the server-authoritative shape.
--
-- Conflict fixed here:
--   * roadlive_init created the table with `user_id uuid references profiles(id)`,
--     but the Node server stores Telegram identities as text ('tg-<id>'), so every
--     push subscribe/upsert failed with "invalid input syntax for type uuid".
--   * `p256dh` / `auth` were NOT NULL while the server stores the whole
--     PushSubscription in `subscription` jsonb, so inserts violated NOT NULL.
--   * `endpoint` was only UNIQUE; the server upserts with onConflict 'endpoint'
--     and treats it as the identity of a subscription.
--
-- This migration is idempotent and safe to run on an existing database.

-- 1. Columns required by the server model.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS subscription JSONB,
  ADD COLUMN IF NOT EXISTS district_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Legacy key columns are no longer written by the server.
--    Guarded because a table created directly by push_persistence never had them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'p256dh'
  ) THEN
    EXECUTE 'ALTER TABLE public.push_subscriptions ALTER COLUMN p256dh DROP NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'auth'
  ) THEN
    EXECUTE 'ALTER TABLE public.push_subscriptions ALTER COLUMN auth DROP NOT NULL';
  END IF;

  -- 3. Backfill `subscription` for rows created before this migration.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'p256dh'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_subscriptions' AND column_name = 'auth'
  ) THEN
    EXECUTE $backfill$
      UPDATE public.push_subscriptions
      SET subscription = jsonb_build_object(
            'endpoint', endpoint,
            'keys', jsonb_build_object('p256dh', p256dh, 'auth', auth)
          )
      WHERE subscription IS NULL
        AND p256dh IS NOT NULL
        AND auth IS NOT NULL
    $backfill$;
  END IF;
END
$$;

-- 4. Telegram identity is text, not a profiles FK.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_fkey;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- 5. Drop the surrogate uuid key: `endpoint` is the subscription identity.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_pkey;

ALTER TABLE public.push_subscriptions
  DROP COLUMN IF EXISTS id;

ALTER TABLE public.push_subscriptions
  ALTER COLUMN endpoint SET NOT NULL;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (endpoint);

-- 6. One index per column (the two legacy migrations created duplicates).
DROP INDEX IF EXISTS public.idx_push_subscriptions_user_id;
DROP INDEX IF EXISTS public.idx_push_subscriptions_district_id;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_district_id_idx
  ON public.push_subscriptions(district_id);

-- 7. The owner-comparison policy compared auth.uid() (uuid) with user_id and is
--    meaningless now that browsers have no access at all.
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;

-- 8. Server-only table.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;