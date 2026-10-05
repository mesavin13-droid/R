-- ROADLIVE: make driver questions and answers server-authoritative.
-- Browser clients must not be able to forge question/answer ownership or counters.

DROP POLICY IF EXISTS "Drivers ask questions" ON questions;
DROP POLICY IF EXISTS "Drivers answer questions" ON question_answers;

REVOKE ALL ON TABLE questions FROM anon, authenticated;
REVOKE ALL ON TABLE question_answers FROM anon, authenticated;

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_answers ENABLE ROW LEVEL SECURITY;

-- Reads and mutations are performed by the server with service_role.
-- Keep the tables closed to browser roles as defense in depth.
