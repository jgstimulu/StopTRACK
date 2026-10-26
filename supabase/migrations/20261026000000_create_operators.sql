create table if not exists public.operators (
  id text primary key check (char_length(id) between 1 and 128),
  name text not null check (char_length(name) between 1 and 128),
  role text not null default 'Operador' check (char_length(role) <= 128),
  can_start boolean not null default false,
  can_close boolean not null default false,
  active boolean not null default true,
  pin_salt text not null check (pin_salt ~ '^[a-f0-9]{32}$'),
  pin_hash text not null check (pin_hash ~ '^[a-f0-9]{128}$')
);

alter table public.operators enable row level security;
revoke all on table public.operators from public, anon, authenticated;
grant all on table public.operators to service_role;
