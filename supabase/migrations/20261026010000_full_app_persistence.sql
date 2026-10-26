create table if not exists public.stoppage_types (
  id text primary key check (char_length(id) between 1 and 128),
  name text not null check (char_length(name) between 1 and 128),
  color text not null check (char_length(color) between 1 and 32),
  description text not null default '' check (char_length(description) <= 500),
  active boolean not null default true
);

create table if not exists public.active_stoppages (
  machine_id text primary key check (char_length(machine_id) between 1 and 64),
  id text not null unique check (char_length(id) between 1 and 128),
  start_timestamp bigint not null check (start_timestamp > 0),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.stoppages (
  id text primary key check (char_length(id) between 1 and 128),
  machine_id text not null check (char_length(machine_id) between 1 and 64),
  date text not null,
  start_time text not null,
  start_timestamp bigint not null check (start_timestamp > 0),
  created_at bigint not null default 0,
  data jsonb not null
);

create unique index if not exists stoppages_machine_date_start_time_key
  on public.stoppages (machine_id, date, start_time);

create index if not exists stoppages_start_timestamp_idx
  on public.stoppages (start_timestamp desc);

create table if not exists public.app_settings (
  key text primary key check (char_length(key) between 1 and 128),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  role text not null check (role in ('admin', 'operator')),
  operator_id text,
  can_start boolean,
  can_close boolean,
  expires_at bigint not null
);

create index if not exists auth_sessions_expires_at_idx
  on public.auth_sessions (expires_at);

alter table public.stoppage_types enable row level security;
alter table public.active_stoppages enable row level security;
alter table public.stoppages enable row level security;
alter table public.app_settings enable row level security;
alter table public.auth_sessions enable row level security;

revoke all on table public.stoppage_types, public.active_stoppages, public.stoppages,
  public.app_settings, public.auth_sessions from public, anon, authenticated;
grant all on table public.stoppage_types, public.active_stoppages, public.stoppages,
  public.app_settings, public.auth_sessions to service_role;

create or replace function public.save_active_stoppage(
  p_machine_id text,
  p_data jsonb,
  p_replace_existing boolean,
  p_require_existing boolean,
  p_expected_start_timestamp bigint
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_existing public.active_stoppages%rowtype;
  v_machine_id text := upper(regexp_replace(trim(p_machine_id), '\s+', '', 'g'));
begin
  perform pg_advisory_xact_lock(hashtextextended(v_machine_id, 0));

  select * into v_existing
  from public.active_stoppages
  where machine_id = v_machine_id
  for update;

  if p_require_existing and (
    not found or v_existing.start_timestamp <> p_expected_start_timestamp
  ) then
    return jsonb_build_object('success', false, 'error', 'A paragem ativa já foi alterada noutro posto.');
  end if;
  if not p_replace_existing and found then
    return jsonb_build_object('success', false, 'error', 'Já existe uma paragem ativa para esta máquina.');
  end if;

  insert into public.active_stoppages (machine_id, id, start_timestamp, data, updated_at)
  values (
    v_machine_id,
    p_data->>'id',
    (p_data->>'startTimestamp')::bigint,
    p_data,
    now()
  )
  on conflict (machine_id) do update
    set id = excluded.id,
        start_timestamp = excluded.start_timestamp,
        data = excluded.data,
        updated_at = now();

  return jsonb_build_object('success', true, 'data', p_data);
end;
$$;

create or replace function public.save_stoppage_and_clear_active(
  p_record jsonb,
  p_machine_id text,
  p_start_timestamp bigint,
  p_expected_active boolean
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_active public.active_stoppages%rowtype;
  v_machine_id text := upper(regexp_replace(trim(p_machine_id), '\s+', '', 'g'));
begin
  if p_expected_active then
    perform pg_advisory_xact_lock(hashtextextended(v_machine_id, 0));

    select * into v_active
    from public.active_stoppages
    where machine_id = v_machine_id
    for update;

    if not found or v_active.start_timestamp <> p_start_timestamp then
      return jsonb_build_object('success', false, 'error', 'A paragem ativa já foi alterada noutro posto.');
    end if;
  end if;

  insert into public.stoppages (
    id, machine_id, date, start_time, start_timestamp, created_at, data
  )
  values (
    p_record->>'id',
    v_machine_id,
    p_record->>'date',
    p_record->>'startTime',
    p_start_timestamp,
    coalesce((p_record->>'createdAt')::bigint, 0),
    p_record
  )
  on conflict (id) do update
    set machine_id = excluded.machine_id,
        date = excluded.date,
        start_time = excluded.start_time,
        start_timestamp = excluded.start_timestamp,
        created_at = excluded.created_at,
        data = excluded.data;

  if p_expected_active then
    delete from public.active_stoppages
    where machine_id = v_machine_id
      and start_timestamp = p_start_timestamp;
  end if;

  return jsonb_build_object('success', true, 'data', p_record);
end;
$$;

create or replace function public.batch_import_stoppages(
  p_records jsonb,
  p_replace_existing boolean
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_record jsonb;
  v_imported integer := 0;
  v_rows integer;
  v_total integer;
begin
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'p_records must be a JSON array';
  end if;

  if p_replace_existing then
    delete from public.stoppages;
  end if;

  for v_record in select item from jsonb_array_elements(p_records) as records(item)
  loop
    insert into public.stoppages (
      id, machine_id, date, start_time, start_timestamp, created_at, data
    )
    values (
      v_record->>'id',
      upper(regexp_replace(trim(coalesce(v_record->>'machineId', v_record->>'machine_id')), '\s+', '', 'g')),
      coalesce(v_record->>'date', ''),
      coalesce(v_record->>'startTime', v_record->>'start_time', ''),
      coalesce((v_record->>'startTimestamp')::bigint, (v_record->>'start_timestamp')::bigint),
      coalesce((v_record->>'createdAt')::bigint, (v_record->>'created_at')::bigint, 0),
      v_record
    )
    on conflict (machine_id, date, start_time) do nothing;

    get diagnostics v_rows = row_count;
    v_imported := v_imported + v_rows;
  end loop;

  select count(*) into v_total from public.stoppages;
  return jsonb_build_object(
    'importedCount', v_imported,
    'duplicatesSkipped', jsonb_array_length(p_records) - v_imported,
    'totalRecords', v_total
  );
end;
$$;

create or replace function public.reset_app_data(p_default_types jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.operators;
  delete from public.stoppages;
  delete from public.active_stoppages;
  delete from public.stoppage_types;
  delete from public.auth_sessions;

  insert into public.stoppage_types (id, name, color, description, active)
  select
    item->>'id',
    item->>'name',
    item->>'color',
    coalesce(item->>'description', ''),
    coalesce((item->>'active')::boolean, true)
  from jsonb_array_elements(p_default_types) as items(item);
end;
$$;

revoke all on function public.save_active_stoppage(text, jsonb, boolean, boolean, bigint) from public, anon, authenticated;
revoke all on function public.save_stoppage_and_clear_active(jsonb, text, bigint, boolean) from public, anon, authenticated;
revoke all on function public.batch_import_stoppages(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.reset_app_data(jsonb) from public, anon, authenticated;
grant execute on function public.save_active_stoppage(text, jsonb, boolean, boolean, bigint) to service_role;
grant execute on function public.save_stoppage_and_clear_active(jsonb, text, bigint, boolean) to service_role;
grant execute on function public.batch_import_stoppages(jsonb, boolean) to service_role;
grant execute on function public.reset_app_data(jsonb) to service_role;
