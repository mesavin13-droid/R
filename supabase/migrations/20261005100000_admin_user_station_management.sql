-- ROADLIVE: server-authoritative user bans and station administration.
--
-- Goal:
--   * A ban becomes a server fact instead of a flag in one browser. Every request
--     re-reads the ban state, so a banned driver loses access immediately and on
--     every device.
--   * Admins manage fuel stations through the API instead of localStorage. The
--     browser keeps read access to the station list because it is public reference
--     data, but every write grant is revoked.
--
-- Role split inherited from 0800: admins and moderators may moderate events,
-- admins may ban users and edit stations, ads and staff stay owner-only.

-- 1. Ban bookkeeping on profiles.
-- is_banned already exists; these columns record who banned whom and when.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_by BIGINT,
  ADD COLUMN IF NOT EXISTS banned_by_username VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ban_reason VARCHAR(300);

CREATE INDEX IF NOT EXISTS profiles_banned_idx
  ON public.profiles(is_banned)
  WHERE is_banned;

-- 2. Station administration bookkeeping.
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by BIGINT;

CREATE INDEX IF NOT EXISTS stations_active_idx
  ON public.stations(is_active);

DROP TRIGGER IF EXISTS stations_touch_updated_at ON public.stations;
CREATE TRIGGER stations_touch_updated_at
  BEFORE UPDATE ON public.stations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Reference tables become explicitly read-only for the browser.
-- RLS already blocked these writes through SELECT-only policies, but leaving
-- INSERT/UPDATE/DELETE/TRUNCATE granted to anon and authenticated means any
-- future policy mistake would turn into a data breach. Revoke them explicitly.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.stations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.districts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.businesses FROM anon, authenticated;

GRANT SELECT ON public.stations TO anon, authenticated;
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT SELECT ON public.districts TO anon, authenticated;
GRANT SELECT ON public.businesses TO anon, authenticated;

-- The admin API writes with service_role, so nothing else needs a grant here.
GRANT ALL ON public.stations TO service_role;
GRANT ALL ON public.profiles TO service_role;