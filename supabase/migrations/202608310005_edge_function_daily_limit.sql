-- S-06: Edge Function 日调用上限（按 function 计；默认 10000；读 platform_config）
-- 键：edge_function_daily_call_limit
-- 鉴权/超时在 Edge Function 层实现；本迁移提供记账与限额 RPC（仅 service_role）

begin;

insert into public.platform_config(key, value)
values ('edge_function_daily_call_limit', '10000'::jsonb)
on conflict (key) do nothing;

create table if not exists public.edge_function_call_log (
  id bigint generated always as identity primary key,
  function_name text not null,
  call_day date not null,
  call_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint edge_function_call_log_name_len check (char_length(function_name) between 1 and 64)
);

create unique index if not exists edge_function_call_log_name_day_uidx
  on public.edge_function_call_log (function_name, call_day);

alter table public.edge_function_call_log enable row level security;
revoke all on public.edge_function_call_log from public, anon, authenticated;

-- 查询某 function 今日是否还可调用（不记账）
create or replace function public.check_edge_function_call_allowed(p_function_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_limit integer;
  v_used integer;
  v_day date;
begin
  v_name := nullif(trim(coalesce(p_function_name, '')), '');
  if v_name is null or length(v_name) > 64 then
    raise exception 'invalid function name';
  end if;

  v_day := (now() at time zone 'Asia/Shanghai')::date;
  v_limit := public.get_platform_config_int('edge_function_daily_call_limit', 10000);

  select coalesce(call_count, 0)::integer into v_used
  from public.edge_function_call_log
  where function_name = v_name and call_day = v_day;

  v_used := coalesce(v_used, 0);

  return jsonb_build_object(
    'allowed', v_used < v_limit,
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'day', to_char(v_day, 'YYYY-MM-DD'),
    'function_name', v_name
  );
end;
$$;

revoke all on function public.check_edge_function_call_allowed(text) from public, anon, authenticated;

-- 记账一次调用；超限则拒绝
create or replace function public.record_edge_function_call(p_function_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_limit integer;
  v_used integer;
  v_day date;
begin
  v_name := nullif(trim(coalesce(p_function_name, '')), '');
  if v_name is null or length(v_name) > 64 then
    raise exception 'invalid function name';
  end if;

  v_day := (now() at time zone 'Asia/Shanghai')::date;
  v_limit := public.get_platform_config_int('edge_function_daily_call_limit', 10000);

  insert into public.edge_function_call_log(function_name, call_day, call_count)
  values (v_name, v_day, 1)
  on conflict (function_name, call_day)
  do update set
    call_count = public.edge_function_call_log.call_count + 1,
    updated_at = now()
  returning call_count into v_used;

  if v_used > v_limit then
    update public.edge_function_call_log
    set call_count = call_count - 1, updated_at = now()
    where function_name = v_name and call_day = v_day;
    raise exception 'edge_function_daily_limit_exceeded'
      using errcode = 'P0001',
            detail = format('function=%s limit=%s used=%s', v_name, v_limit, v_used - 1);
  end if;

  return jsonb_build_object(
    'recorded', true,
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'day', to_char(v_day, 'YYYY-MM-DD'),
    'function_name', v_name
  );
end;
$$;

revoke all on function public.record_edge_function_call(text) from public, anon, authenticated;

commit;
