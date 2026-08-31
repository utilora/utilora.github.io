-- S-02: 验证码发送服务端限额（每邮箱每小时 / 每 IP 每小时；点发送即计）
-- 限额读 platform_config；缺省 邮箱 3、IP 10。管理端键：otp_per_email_per_hour、otp_per_ip_per_hour。

begin;

create table if not exists public.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_config enable row level security;
revoke all on public.platform_config from public, anon, authenticated;

insert into public.platform_config(key, value)
values
  ('otp_per_email_per_hour', '3'::jsonb),
  ('otp_per_ip_per_hour', '10'::jsonb)
on conflict (key) do nothing;

create table if not exists public.otp_send_log (
  id bigint generated always as identity primary key,
  email_norm text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists otp_send_log_email_created_idx
  on public.otp_send_log (email_norm, created_at desc);

create index if not exists otp_send_log_ip_created_idx
  on public.otp_send_log (ip_hash, created_at desc);

alter table public.otp_send_log enable row level security;
revoke all on public.otp_send_log from public, anon, authenticated;

-- 若 S-01 尚未部署，补齐配置读取函数
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

-- 发送前检查：邮箱与 IP 任一超限则拒绝
create or replace function public.check_otp_send_allowed(p_email text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_hash text;
  v_email_limit integer;
  v_ip_limit integer;
  v_email_used integer;
  v_ip_used integer;
  v_since timestamptz;
begin
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null or position('@' in v_email) = 0 or length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  if v_hash is null or length(v_hash) < 8 or length(v_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;

  v_since := now() - interval '1 hour';
  v_email_limit := public.get_platform_config_int('otp_per_email_per_hour', 3);
  v_ip_limit := public.get_platform_config_int('otp_per_ip_per_hour', 10);

  select count(*)::integer into v_email_used
  from public.otp_send_log
  where email_norm = v_email and created_at >= v_since;

  select count(*)::integer into v_ip_used
  from public.otp_send_log
  where ip_hash = v_hash and created_at >= v_since;

  return jsonb_build_object(
    'allowed', (v_email_used < v_email_limit and v_ip_used < v_ip_limit),
    'email_limit', v_email_limit,
    'email_used', v_email_used,
    'email_remaining', greatest(v_email_limit - v_email_used, 0),
    'ip_limit', v_ip_limit,
    'ip_used', v_ip_used,
    'ip_remaining', greatest(v_ip_limit - v_ip_used, 0),
    'reason', case
      when v_email_used >= v_email_limit then 'email_limit'
      when v_ip_used >= v_ip_limit then 'ip_limit'
      else null
    end
  );
end;
$$;

revoke all on function public.check_otp_send_allowed(text, text) from public, anon, authenticated;

-- 点发送即记账；超限则拒绝并抛异常
create or replace function public.record_otp_send(p_email text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_email text;
  v_hash text;
begin
  v_check := public.check_otp_send_allowed(p_email, p_ip_hash);
  if not coalesce((v_check ->> 'allowed')::boolean, false) then
    raise exception 'otp_rate_limit_exceeded'
      using errcode = 'P0001',
            detail = coalesce(v_check ->> 'reason', 'limit');
  end if;

  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');

  insert into public.otp_send_log(email_norm, ip_hash)
  values (v_email, v_hash);

  return jsonb_build_object(
    'recorded', true,
    'email_limit', (v_check ->> 'email_limit')::integer,
    'email_used', (v_check ->> 'email_used')::integer + 1,
    'email_remaining', greatest((v_check ->> 'email_remaining')::integer - 1, 0),
    'ip_limit', (v_check ->> 'ip_limit')::integer,
    'ip_used', (v_check ->> 'ip_used')::integer + 1,
    'ip_remaining', greatest((v_check ->> 'ip_remaining')::integer - 1, 0)
  );
end;
$$;

revoke all on function public.record_otp_send(text, text) from public, anon, authenticated;

commit;
