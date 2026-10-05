-- ROADLIVE: tighten RLS policies so profile metadata/roles cannot be self-escalated.
BEGIN;

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON profiles;

CREATE POLICY "Users can create a safe driver profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND role = 'driver'
    AND level = 'Новичок'
    AND rating = 5.00
    AND helpful_confirmations_count = 0
    AND events_count = 0
    AND questions_count = 0
    AND answers_count = 0
    AND reports_count = 0
    AND is_banned = false
  );

-- Profile role, ban state, reputation and counters are server-controlled.
-- There is intentionally no client UPDATE policy on profiles.

-- Public map/reference data remains readable.
DROP POLICY IF EXISTS "Public read cities" ON cities;
DROP POLICY IF EXISTS "Public read districts" ON districts;
DROP POLICY IF EXISTS "Public read stations" ON stations;
DROP POLICY IF EXISTS "Public read businesses" ON businesses;

CREATE POLICY "Public read cities"
  ON cities FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public read districts"
  ON districts FOR SELECT
  USING (true);

CREATE POLICY "Public read stations"
  ON stations FOR SELECT
  USING (true);

CREATE POLICY "Public read businesses"
  ON businesses FOR SELECT
  USING (true);

-- Telegram identity is server-managed; clients must never be able to rewrite it.
DROP POLICY IF EXISTS "Users manage own Telegram account" ON telegram_accounts;
CREATE POLICY "Users read own Telegram account"
  ON telegram_accounts FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- The server owns Telegram account writes.

COMMIT;
