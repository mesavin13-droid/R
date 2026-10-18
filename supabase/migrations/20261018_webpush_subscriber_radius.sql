-- ROAD LIVE: per-device Web Push radius and location policy.
-- No client roles receive access; only trusted server service_role reads/writes.
-- Apply to the production Supabase project before merging the app changes.
-- Legacy user_id is a UUID foreign key to profiles(id). Telegram session IDs
-- are strings ("tg-123"); store them separately, never in the UUID field.
alter table public.push_subscriptions
  add column if not exists telegram_user_id text;
alter table public.push_subscriptions
  add column if not exists last_lat double precision;
alter table public.push_subscriptions
  add column if not exists last_lng double precision;
alter table public.push_subscriptions
  add column if not exists alert_radius_km integer not null default 5;
alter table public.push_subscriptions
  add column if not exists alert_mode text not null default 'live';
alter table public.push_subscriptions
  add column if not exists fixed_lat double precision;
alter table public.push_subscriptions
  add column if not exists fixed_lng double precision;
alter table public.push_subscriptions
  add column if not exists gps_at timestamptz;

do $ddl$
begin
 if not exists (
   select 1 from pg_constraint where conrelid='public.push_subscriptions'::regclass
   and conname='roadlive_alert_radius_km_check'
 ) then
   alter table public.push_subscriptions
     add constraint roadlive_alert_radius_km_check
     check (alert_radius_km in (5,15,30,50));
 end if;
 if not exists (
   select 1 from pg_constraint where conrelid='public.push_subscriptions'::regclass
   and conname='roadlive_alert_mode_check'
 ) then
   alter table public.push_subscriptions
     add constraint roadlive_alert_mode_check
     check (alert_mode in ('live','fixed'));
 end if;
 if not exists (
   select 1 from pg_constraint where conrelid='public.push_subscriptions'::regclass
   and conname='roadlive_fixed_coords_check'
 ) then
   alter table public.push_subscriptions
     add constraint roadlive_fixed_coords_check
     check (
       ((fixed_lat is null) and (fixed_lng is null))
       or (
         fixed_lat between -85 and 85
         and fixed_lng between -180 and 180
       )
     );
 end if;
end;
$ddl$;

-- Old records cannot suddenly become 'fresh' merely because the subscription
-- was edited. Only authenticated GPS heartbeats set gps_at.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Subscriber identity stays on the trusted API server; multiple devices may
-- share one Telegram account, hence a regular (not unique) index.
create index if not exists roadlive_push_telegram_user_idx
  on public.push_subscriptions (telegram_user_id);

-- Internal driver-location heartbeats for optional Telegram Bot alerts and
-- real GPS Web Push updates. The former was referenced by server.ts, but the
-- table did not exist in the restored project.
create table if not exists public.driver_locations (
  telegram_id bigint primary key,
  user_id text not null,
  last_lat double precision not null check (last_lat between -85 and 85),
  last_lng double precision not null check (last_lng between -180 and 180),
  updated_at timestamptz not null default now()
);
create index if not exists roadlive_driver_locations_recent_idx
  on public.driver_locations (updated_at desc);

-- No unauthenticated, browser "authenticated" or Data API access to raw
-- driver locations or device push keys. Service-role access is server-only.
alter table public.driver_locations enable row level security;
revoke all on public.driver_locations from public, anon, authenticated;

