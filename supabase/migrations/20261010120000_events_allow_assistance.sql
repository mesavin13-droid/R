-- Allow SOS / assistance events (and questions) to be persisted in the events
-- table. The original init migration (20261004000000) defined the `type` CHECK
-- without 'assistance', so the server-side EVENT_TYPES whitelist and the DB
-- constraint disagreed: even after the server accepted an SOS, the INSERT was
-- rejected by Postgres. We drop the old constraint and re-add it with the full
-- set of types the application actually uses.
--
-- `events_type_check` is the default name Postgres/Supabase gives a named
-- CHECK defined inline in CREATE TABLE, so DROP CONSTRAINT IF EXISTS is safe.

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_type_check
  CHECK (type IN (
    'crossing', 'accident', 'patrol', 'fuel', 'road',
    'traffic_light', 'hazard', 'assistance', 'question', 'other'
  ));
