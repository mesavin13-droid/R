create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id text not null,
  subscription jsonb not null,
  district_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant all on table public.push_subscriptions to service_role;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

create index if not exists push_subscriptions_district_id_idx
  on public.push_subscriptions(district_id);
