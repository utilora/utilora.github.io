-- S-08 找回密码限流：发送重置邮件与提交新密码均读配置
-- 默认每邮箱每小时 3 次、每 IP 每小时 10 次。不向客户端泄露邮箱是否存在。

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
  ('password_reset_per_email_per_hour', '3'::jsonb),
  ('password_reset_per_ip_per_hour', '10'::jsonb)
on conflict (key) do nothing;

create table if not exists public.password_reset_log (
  id bigint generated always as identity primary key,
  email_norm text not null,
  ip_hash text not null,
  kind text not null check (kind in ('send', 'submit')),
  allowed boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_log_email_created_idx
  on public.password_reset_log (email_norm, created_at desc);

create index if not exists password_reset_log_ip_created_idx
  on public.password_reset_log (ip_hash, created_at desc);

alter table public.password_reset_log enable row level security;
revoke all on public.password_reset_log from public, anon, authenticated;

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

create or replace function public.check_password_reset_allowed(p_email text, p_ip_hash text)
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
  v_email_limit := public.get_platform_config_int('password_reset_per_email_per_hour', 3);
  v_ip_limit := public.get_platform_config_int('password_reset_per_ip_per_hour', 10);

  select count(*)::integer into v_email_used
  from public.password_reset_log
  where email_norm = v_email and created_at >= v_since;

  select count(*)::integer into v_ip_used
  from public.password_reset_log
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

revoke all on function public.check_password_reset_allowed(text, text) from public, anon, authenticated;

create or replace function public.record_password_reset(p_email text, p_ip_hash text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_email text;
  v_hash text;
  v_kind text;
  v_allowed boolean;
begin
  v_kind := lower(nullif(trim(coalesce(p_kind, '')), ''));
  if v_kind not in ('send', 'submit') then
    v_kind := 'send';
  end if;
  v_check := public.check_password_reset_allowed(p_email, p_ip_hash);
  v_allowed := coalesce((v_check ->> 'allowed')::boolean, false);
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');

  insert into public.password_reset_log(email_norm, ip_hash, kind, allowed)
  values (v_email, v_hash, v_kind, v_allowed);

  if to_regprocedure('public.admin_write_activity(uuid, text, text, text, text, jsonb)') is not null then
    perform public.admin_write_activity(
      null,
      v_email,
      case when v_allowed then 'password_reset_' || v_kind else 'password_reset_blocked' end,
      'auth',
      '/login/',
      jsonb_build_object('kind', v_kind, 'allowed', v_allowed, 'reason', v_check ->> 'reason')
    );
  end if;

  if not v_allowed then
    raise exception 'password_reset_limit_exceeded'
      using errcode = 'P0001',
            detail = coalesce(v_check ->> 'reason', 'limit');
  end if;

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

revoke all on function public.record_password_reset(text, text, text) from public, anon, authenticated;

commit;
