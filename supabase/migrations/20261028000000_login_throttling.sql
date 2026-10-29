-- Limite de tentativas de login/PIN partilhado entre todas as instâncias do servidor.
--
-- Como executar: Supabase -> SQL Editor -> New query -> colar TODO este ficheiro -> Run.
-- É seguro executá-lo mais do que uma vez (usa "if not exists" / "create or replace").
-- Não altera nem apaga nenhum dado existente: só cria a tabela public.login_attempts e 3 funções.

create table if not exists public.login_attempts (
  key text primary key check (char_length(key) between 1 and 200),
  failures integer not null default 0,
  window_started_at bigint not null,
  locked_until bigint not null default 0,
  updated_at bigint not null
);

create index if not exists login_attempts_updated_at_idx
  on public.login_attempts (updated_at);

alter table public.login_attempts enable row level security;

revoke all on table public.login_attempts from public, anon, authenticated;
grant all on table public.login_attempts to service_role;

-- Devolve o instante (ms) até ao qual alguma das chaves está bloqueada; 0 se nenhuma estiver.
create or replace function public.login_throttle_status(
  p_keys text[],
  p_now bigint
) returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(max(locked_until), 0)
  from public.login_attempts
  where key = any(p_keys)
    and locked_until > p_now;
$$;

-- Regista uma tentativa falhada de forma atómica e devolve o instante (ms) até ao qual
-- a chave fica bloqueada (0 se não está bloqueada). A linha fica bloqueada durante a
-- operação (FOR UPDATE), por isso pedidos em simultâneo não perdem contagens.
create or replace function public.login_throttle_fail(
  p_key text,
  p_now bigint,
  p_limit integer,
  p_window_ms bigint,
  p_lock_ms bigint
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_row public.login_attempts%rowtype;
  v_failures integer;
  v_window_started bigint;
  v_locked_until bigint;
begin
  -- Limpeza oportunista de registos antigos (mais de 24 h sem atividade).
  delete from public.login_attempts
  where updated_at < p_now - 86400000
    and key <> p_key;

  insert into public.login_attempts (key, failures, window_started_at, locked_until, updated_at)
  values (p_key, 0, p_now, 0, p_now)
  on conflict (key) do nothing;

  select * into v_row
  from public.login_attempts
  where key = p_key
  for update;

  if p_now - v_row.window_started_at > p_window_ms and v_row.locked_until <= p_now then
    -- A janela anterior terminou e não há bloqueio ativo: recomeça a contagem.
    v_failures := 1;
    v_window_started := p_now;
    v_locked_until := 0;
  else
    v_failures := v_row.failures + 1;
    v_window_started := v_row.window_started_at;
    v_locked_until := v_row.locked_until;
  end if;

  if v_failures >= p_limit then
    v_locked_until := p_now + p_lock_ms;
  end if;

  update public.login_attempts
  set failures = v_failures,
      window_started_at = v_window_started,
      locked_until = v_locked_until,
      updated_at = p_now
  where key = p_key;

  return case when v_locked_until > p_now then v_locked_until else 0 end;
end;
$$;

-- Apaga o contador das chaves indicadas (usado após um login bem-sucedido).
create or replace function public.login_throttle_clear(
  p_keys text[]
) returns void
language plpgsql
set search_path = public
as $$
begin
  delete from public.login_attempts where key = any(p_keys);
end;
$$;

revoke all on function public.login_throttle_status(text[], bigint) from public, anon, authenticated;
revoke all on function public.login_throttle_fail(text, bigint, integer, bigint, bigint) from public, anon, authenticated;
revoke all on function public.login_throttle_clear(text[]) from public, anon, authenticated;
grant execute on function public.login_throttle_status(text[], bigint) to service_role;
grant execute on function public.login_throttle_fail(text, bigint, integer, bigint, bigint) to service_role;
grant execute on function public.login_throttle_clear(text[]) to service_role;

-- Pede ao Supabase (PostgREST) para reconhecer imediatamente as funções novas.
notify pgrst, 'reload schema';
