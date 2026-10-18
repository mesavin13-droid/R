-- ROAD LIVE: per-device Web Push radius and location policy.
-- No client roles receive access; only trusted server service_role reads/writes.
-- Apply to the production Supabase project before merging the app changes.
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
