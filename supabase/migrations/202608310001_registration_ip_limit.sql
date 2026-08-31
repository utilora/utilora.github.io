-- S-01: 每 IP 每天成功注册次数限额（默认 3；Asia/Shanghai 自然日；验证成功才计数）
-- 限额读 platform_config；缺省 3。管理端后续可改配置键 registration_success_per_ip_per_day。

begin;

create table if not exists public.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_config enable row level security;
revoke all on public.platform_config from public, anon, authenticated;

insert into public.platform_config(key, value)
values ('registration_success_per_ip_per_day', '3'::jsonb)
on conflict (key) do nothing;

create table if not exists public.registration_ip_log (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  user_id uuid references auth.users(id) on delete set null,
  reg_day date not null,
  created_at timestamptz not null default now()
);

create unique index if not exists registration_ip_log_user_day_uidx
  on public.registration_ip_log (user_id, reg_day)
  where user_id is not null;

create index if not exists registration_ip_log_ip_day_idx
  on public.registration_ip_log (ip_hash, reg_day);

alter table public.registration_ip_log enable row level security;
revoke all on public.registration_ip_log from public, anon, authenticated;

create or replace function public.get_platform_config_int(p_key text, p_default integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
  n integer;
begin
  select value into v from public.platform_config where key = p_key;
  if v is null then
    return greatest(coalesce(p_default, 0), 0);
  end if;
  begin
    n := (v #>> '{}')::integer;
  exception when others then
    n := null;
  end;
  if n is null then
    begin
      n := (v)::text::integer;
    exception when others then
      n := p_default;
    end;
  end if;
  return greatest(coalesce(n, p_default, 0), 0);
end;
$$;

revoke all on function public.get_platform_config_int(text, integer) from public, anon, authenticated;

-- 仅供 Edge Function（service_role）调用：查询某 IP 今日是否还可注册
create or replace function public.check_registration_ip_allowed(p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_day date;
  v_hash text;
begin
  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  if v_hash is null or length(v_hash) < 8 or length(v_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;

  v_day := (now() at time zone 'Asia/Shanghai')::date;
  v_limit := public.get_platform_config_int('registration_success_per_ip_per_day', 3);

  select count(*)::integer into v_used
  from public.registration_ip_log
  where ip_hash = v_hash and reg_day = v_day;

  return jsonb_build_object(
    'allowed', v_used < v_limit,
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'day', to_char(v_day, 'YYYY-MM-DD')
  );
end;
$$;

revoke all on function public.check_registration_ip_allowed(text) from public, anon, authenticated;

-- 验证成功后记账；超限则拒绝（同一用户同一天只计一次）
create or replace function public.record_registration_ip(p_ip_hash text, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_used integer;
  v_day date;
  v_hash text;
begin
  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  if v_hash is null or length(v_hash) < 8 or length(v_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;

  v_day := (now() at time zone 'Asia/Shanghai')::date;
  v_limit := public.get_platform_config_int('registration_success_per_ip_per_day', 3);

  -- 同一用户同一天已记过则幂等返回
  if exists (
    select 1 from public.registration_ip_log
    where user_id = p_user_id and reg_day = v_day
  ) then
    select count(*)::integer into v_used
    from public.registration_ip_log
    where ip_hash = v_hash and reg_day = v_day;
    return jsonb_build_object(
      'recorded', false,
      'reason', 'already_counted',
      'limit', v_limit,
      'used', v_used,
      'remaining', greatest(v_limit - v_used, 0)
    );
  end if;

  select count(*)::integer into v_used
  from public.registration_ip_log
  where ip_hash = v_hash and reg_day = v_day;

  if v_used >= v_limit then
    raise exception 'registration_ip_limit_exceeded'
      using errcode = 'P0001',
            detail = format('limit=%s used=%s', v_limit, v_used);
  end if;

  insert into public.registration_ip_log(ip_hash, user_id, reg_day)
  values (v_hash, p_user_id, v_day);

  v_used := v_used + 1;

  return jsonb_build_object(
    'recorded', true,
    'limit', v_limit,
    'used', v_used,
    'remaining', greatest(v_limit - v_used, 0),
    'day', to_char(v_day, 'YYYY-MM-DD')
  );
end;
$$;

revoke all on function public.record_registration_ip(text, uuid) from public, anon, authenticated;

commit;
