create table if not exists public.daily_machine_availability (
  availability_date date not null,
  machine_id text not null check (machine_id ~ '^F(0[1-9]|[12][0-9]|30)$'),
  status text not null check (status in ('Disponível', 'Em manutenção', 'Indisponível')),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (availability_date, machine_id)
);

alter table public.daily_machine_availability enable row level security;

revoke all on table public.daily_machine_availability from public, anon, authenticated;
grant all on table public.daily_machine_availability to service_role;
