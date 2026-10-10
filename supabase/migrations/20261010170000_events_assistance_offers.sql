-- Assistance OFFERS flow for SOS events: several drivers can offer help at
-- once ("бесплатно" / "за оплату" / "по договорённости"), and the SOS author
-- accepts ONE of them. Accepting assigns events.helper_user_id, so the rest of
-- the flow (chat, mutual resolved-confirmations) keeps working unchanged.

CREATE TABLE IF NOT EXISTS public.event_assistance_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  helper_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- How the offering driver proposes to help: free of charge, for a price, or
  -- "let's talk it over" (price_note then usually holds an amount/remark).
  offer_kind VARCHAR(16) NOT NULL DEFAULT 'free'
    CHECK (offer_kind IN ('free', 'paid', 'negotiable')),
  price_note VARCHAR(60),
  message VARCHAR(300),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  -- One live offer per driver per event; a re-offer after decline reuses the row.
  UNIQUE (event_id, helper_user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_assistance_offers_event
  ON public.event_assistance_offers (event_id, created_at DESC);

-- Browser clients must go through the authenticated server API.
ALTER TABLE public.event_assistance_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_assistance_offers FROM anon, authenticated;

COMMENT ON TABLE public.event_assistance_offers IS 'Drivers offering help on a SOS/assistance event (free / paid / negotiable); the author accepts one.';
COMMENT ON COLUMN public.event_assistance_offers.status IS 'pending = waiting for the author; accepted = chosen helper; declined = author said no; withdrawn = helper cancelled.';
