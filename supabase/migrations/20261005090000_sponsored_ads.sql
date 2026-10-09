-- ROADLIVE: server-side sponsored banners and advertising settings.
--
-- Goal:
--   * Ads stop living in a browser localStorage sandbox and become shared server data,
--     so a campaign created by the owner is visible to every user and every device.
--   * All writes are owner-only and are enforced by the API through service_role.
--     The browser receives read-only access through a public, rate-limited endpoint,
--     never through PostgREST, because the tables are revoked from anon/authenticated.
--   * Nothing here is writable by delegated admins or moderators: advertising is the
--     owner's area, matching the RBAC policy introduced in 0800.

-- 1. Custom SVG icons used as brand marks on ad banners.
CREATE TABLE IF NOT EXISTS public.ad_custom_icons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  svg_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sponsored banners shown on the map.
CREATE TABLE IF NOT EXISTS public.sponsored_ads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  subtitle VARCHAR(300) DEFAULT '',
  category_badge VARCHAR(60),
  icon VARCHAR(16),
  custom_icon_id UUID REFERENCES public.ad_custom_icons(id) ON DELETE SET NULL,
  custom_logo_url TEXT,
  banner_color VARCHAR(32),
  address VARCHAR(300) DEFAULT '',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  phone VARCHAR(60),
  promo_code VARCHAR(80),
  discount_text VARCHAR(120),
  action_text VARCHAR(60),
  details TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sponsored_ads_coordinates_check
    CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS sponsored_ads_active_idx
  ON public.sponsored_ads(is_active, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS sponsored_ads_custom_icon_idx
  ON public.sponsored_ads(custom_icon_id);

-- 3. Single-row table holding the banner rotation and auto-dismiss settings.
CREATE TABLE IF NOT EXISTS public.ad_display_config (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  interval_seconds INTEGER NOT NULL DEFAULT 900,
  auto_dismiss_seconds INTEGER NOT NULL DEFAULT 30,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT ad_display_config_single_row CHECK (id = 1),
  CONSTRAINT ad_display_config_interval_check
    CHECK (interval_seconds BETWEEN 30 AND 86400),
  CONSTRAINT ad_display_config_dismiss_check
    CHECK (auto_dismiss_seconds BETWEEN 5 AND 600)
);

INSERT INTO public.ad_display_config (id, interval_seconds, auto_dismiss_seconds, enabled)
VALUES (1, 900, 30, TRUE)
ON CONFLICT (id) DO NOTHING;

-- 4. Lock every advertising table down to the server only.
ALTER TABLE public.ad_custom_icons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsored_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_display_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ad_custom_icons FROM anon, authenticated;
REVOKE ALL ON public.sponsored_ads FROM anon, authenticated;
REVOKE ALL ON public.ad_display_config FROM anon, authenticated;

GRANT ALL ON public.ad_custom_icons TO service_role;
GRANT ALL ON public.sponsored_ads TO service_role;
GRANT ALL ON public.ad_display_config TO service_role;

-- 5. Keep updated_at honest without relying on application code.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sponsored_ads_touch_updated_at ON public.sponsored_ads;
CREATE TRIGGER sponsored_ads_touch_updated_at
  BEFORE UPDATE ON public.sponsored_ads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Atomic impression/click counters.
-- Reading a counter and writing it back would lose updates under concurrency,
-- so the increment happens inside the database and only service_role may call it.
CREATE OR REPLACE FUNCTION public.increment_ad_stat(p_ad_id UUID, p_field TEXT)
RETURNS INTEGER AS $$
DECLARE
  result INTEGER;
BEGIN
  IF p_field = 'impressions' THEN
    UPDATE public.sponsored_ads
      SET impressions = impressions + 1
      WHERE id = p_ad_id
      RETURNING impressions INTO result;
  ELSIF p_field = 'clicks' THEN
    UPDATE public.sponsored_ads
      SET clicks = clicks + 1
      WHERE id = p_ad_id
      RETURNING clicks INTO result;
  ELSE
    RAISE EXCEPTION 'Unsupported ad stat field: %', p_field;
  END IF;
  RETURN COALESCE(result, 0);
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.increment_ad_stat(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_stat(UUID, TEXT) TO service_role;
