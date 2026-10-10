-- Full assistance ("взаимовыручка") flow support for SOS events.
--
-- The client already models the flow (helperUserId / helperName /
-- creatorConfirmedResolved / helperConfirmedResolved on RoadEvent), but the
-- events table had no columns for it: the server could only append a comment
-- when a driver pressed "Выехать на помощь", so nobody ever saw WHO is coming
-- and the call could never be confirmed closed by both sides.
--
-- helper_user_id references the driver profile (same UUID space as user_id).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS helper_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS helper_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS creator_confirmed_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS helper_confirmed_resolved BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.events.helper_user_id IS 'Profile UUID of the driver who responded to the SOS/assistance call';
COMMENT ON COLUMN public.events.helper_name IS 'Display name of the responding driver';
