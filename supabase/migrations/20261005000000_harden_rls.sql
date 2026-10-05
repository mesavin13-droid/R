-- ROADLIVE security hardening
-- Remove anonymous write access from the public API and enable RLS on every exposed table.
-- Authorization is based on Supabase JWT auth.uid() where authenticated access is used.

BEGIN;

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Remove the old anonymous write policies from the initial migration.
DROP POLICY IF EXISTS "Drivers create events" ON events;
DROP POLICY IF EXISTS "Drivers confirm events" ON event_confirmations;
DROP POLICY IF EXISTS "Drivers comment events" ON event_comments;
DROP POLICY IF EXISTS "Drivers ask questions" ON questions;
DROP POLICY IF EXISTS "Drivers answer questions" ON question_answers;
DROP POLICY IF EXISTS "Drivers submit observations" ON station_observations;
DROP POLICY IF EXISTS "Drivers submit reports" ON reports;

-- Profiles contain email and other private fields; do not expose the whole row publicly.
DROP POLICY IF EXISTS "Public read profiles" ON profiles;
CREATE POLICY "Users can read their own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can create their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Events are publicly readable when not hidden, but writes require an authenticated owner.
CREATE POLICY "Authenticated users create own events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own events"
  ON events FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own events"
  ON events FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Event confirmations.
CREATE POLICY "Authenticated users create own confirmations"
  ON event_confirmations FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own confirmations"
  ON event_confirmations FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own confirmations"
  ON event_confirmations FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Event comments.
CREATE POLICY "Authenticated users create own event comments"
  ON event_comments FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own event comments"
  ON event_comments FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own event comments"
  ON event_comments FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Driver questions.
CREATE POLICY "Authenticated users create own questions"
  ON questions FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own questions"
  ON questions FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own questions"
  ON questions FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Question answers.
CREATE POLICY "Authenticated users create own answers"
  ON question_answers FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own answers"
  ON question_answers FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own answers"
  ON question_answers FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Station observations.
CREATE POLICY "Authenticated users create own station observations"
  ON station_observations FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own station observations"
  ON station_observations FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own station observations"
  ON station_observations FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- User reports are private submissions.
DROP POLICY IF EXISTS "Public read reports" ON reports;
CREATE POLICY "Authenticated users submit own reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users read own reports"
  ON reports FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Telegram account links are private to the owner.
CREATE POLICY "Users manage own Telegram account"
  ON telegram_accounts FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Push subscriptions are private to the owner.
CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Audit log: no anonymous access. Existing privileged server workflows can use service_role.
DROP POLICY IF EXISTS "Public read admin_actions" ON admin_actions;
DROP POLICY IF EXISTS "Authenticated users manage admin_actions" ON admin_actions;

-- Businesses are public to read; mutations must not be anonymous.
CREATE POLICY "Public read businesses"
  ON businesses FOR SELECT
  USING (true);

COMMIT;
