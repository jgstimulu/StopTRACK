create table if not exists public.machine_maintenance (
  machine_id text primary key check (machine_id ~ '^F(0[1-9]|[12][0-9]|30)$'),
  note text not null default '' check (char_length(note) <= 500),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.machine_maintenance (machine_id, note, started_at, updated_at)
select latest.machine_id, latest.note, latest.updated_at, latest.updated_at
from (
  select distinct on (machine_id)
    machine_id,
    status,
    note,
    updated_at
  from public.daily_machine_availability
  order by machine_id, availability_date desc, updated_at desc
) as latest
where latest.status = 'Em manutenção'
on conflict (machine_id) do nothing;

alter table public.machine_maintenance enable row level security;

revoke all on table public.machine_maintenance from public, anon, authenticated;
grant all on table public.machine_maintenance to service_role;
