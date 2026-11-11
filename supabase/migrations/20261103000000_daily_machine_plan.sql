create table if not exists public.daily_machine_plan (
  plan_date date not null,
  machine_id text not null check (machine_id ~ '^F(0[1-9]|[12][0-9]|30)$'),
  created_at timestamptz not null default now(),
  primary key (plan_date, machine_id)
);

alter table public.daily_machine_plan enable row level security;

revoke all on table public.daily_machine_plan from public, anon, authenticated;
grant all on table public.daily_machine_plan to service_role;
