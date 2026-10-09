-- ROADLIVE: let the browser address cities by a stable slug instead of a raw UUID.
--
-- Conflict fixed here:
--   The client sends stable ids ('nsk-city-01') and district slugs ('tsentralniy',
--   'leninskiy', ...) but events.city_id, events.district_id, questions.city_id and
--   questions.district_id are UUID FKs. Every insert failed with
--   'invalid input syntax for type uuid'.
--   districts already had a slug column; cities did not.

ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS slug VARCHAR(100);

-- Partial unique index: several NULL slugs are allowed, duplicates are not.
CREATE UNIQUE INDEX IF NOT EXISTS cities_slug_key
  ON public.cities(slug)
  WHERE slug IS NOT NULL;

-- Novosibirsk is the only seeded city; keep its client-side slug stable.
-- Only rows without a slug are touched, so multi-city setups are safe.
UPDATE public.cities
SET slug = 'nsk-city-01'
WHERE slug IS NULL;

-- District slugs are left untouched on purpose: the client (src/data/seedData.ts)
-- already uses the unprefixed slugs seeded by supabase/seed.sql.
