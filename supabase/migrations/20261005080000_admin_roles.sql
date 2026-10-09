-- ROADLIVE: role-based access control with an unremovable owner.
--
-- Goal:
--   * Access is granted only by Telegram id (server-authoritative, never client input).
--   * The owner is defined in ROADLIVE_ADMIN_TELEGRAM_IDS on the server and therefore
--     cannot be revoked or deleted from inside the app.
--   * The owner can delegate limited roles to other Telegram ids:
--       admin      -> moderation + user bans
--       moderator  -> event moderation only
--     Delegated admins never gain access to ads or to admin management.

-- 1. Allow the 'owner' role on profiles.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('driver', 'moderator', 'admin', 'owner'));

-- 2. Delegated staff roles, keyed by Telegram id.
CREATE TABLE IF NOT EXISTS public.telegram_admin_roles (
  telegram_id BIGINT PRIMARY KEY,
  role VARCHAR(20) NOT NULL CHECK (role IN ('moderator', 'admin')),
  granted_by BIGINT,
  granted_by_username VARCHAR(100),
  note VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Only the server (service_role) may read or change staff roles.
ALTER TABLE public.telegram_admin_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.telegram_admin_roles FROM anon, authenticated;
GRANT ALL ON public.telegram_admin_roles TO service_role;

-- 4. Immutable audit trail of every privilege change.
CREATE TABLE IF NOT EXISTS public.admin_role_grants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_telegram_id BIGINT NOT NULL,
  target_username VARCHAR(100),
  action VARCHAR(20) NOT NULL CHECK (action IN ('grant', 'revoke')),
  role VARCHAR(20),
  actor_telegram_id BIGINT NOT NULL,
  actor_username VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_role_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_role_grants FROM anon, authenticated;
GRANT ALL ON public.admin_role_grants TO service_role;

CREATE INDEX IF NOT EXISTS admin_role_grants_created_at_idx
  ON public.admin_role_grants(created_at DESC);
