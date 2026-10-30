create table if not exists public.admin_credentials (
  id text primary key default 'primary',
  email text not null,
  password_salt text not null check (password_salt ~ '^[a-f0-9]{32}$'),
  password_hash text not null check (password_hash ~ '^[a-f0-9]{128}$'),
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.admin_credentials enable row level security;
revoke all on table public.admin_credentials from public, anon, authenticated;
grant all on table public.admin_credentials to service_role;
