-- ROAD LIVE needs a UUID city row for the nsk-city-01 slug used by
-- the public event/question routes. This intentionally inserts no demo
-- incidents, driver accounts, SOS requests or location history.
insert into public.cities (name, slug, latitude, longitude, default_zoom, is_active)
select 'Новосибирск', 'nsk-city-01', 55.030199, 82.920430, 12, true
where not exists (
  select 1 from public.cities
  where slug = 'nsk-city-01' or name = 'Новосибирск'
);