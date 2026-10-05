-- ROADLIVE: final browser-side mutation lockdown.
-- Sensitive reads/writes are server-authoritative and use service_role.
-- Public reference data remains readable by the browser.

REVOKE ALL ON TABLE events FROM anon, authenticated;
REVOKE ALL ON TABLE event_confirmations FROM anon, authenticated;
REVOKE ALL ON TABLE event_comments FROM anon, authenticated;
REVOKE ALL ON TABLE questions FROM anon, authenticated;
REVOKE ALL ON TABLE question_answers FROM anon, authenticated;
REVOKE ALL ON TABLE push_subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE chat_messages FROM anon, authenticated;
REVOKE ALL ON TABLE chat_reactions FROM anon, authenticated;
REVOKE ALL ON TABLE telegram_accounts FROM anon, authenticated;

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_accounts ENABLE ROW LEVEL SECURITY;

-- No browser role receives direct access to these tables.
-- The Node server is the only application read/write path.
