-- S-03: 登录失败冷却（同邮箱或同 IP 连续失败达配置次数后冷却）
-- 限额读 platform_config；缺省连续 5 次、冷却 15 分钟。
-- 管理端键：login_failure_max_attempts、login_cooldown_minutes。

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
  ('login_failure_max_attempts', '5'::jsonb),
  ('login_cooldown_minutes', '15'::jsonb)
on conflict (key) do nothing;

-- 按邮箱 / IP 分别记录连续失败次数与锁定截止时间；成功登录后清零
create table if not exists public.login_attempt_state (
  subject_type text not null check (subject_type in ('email', 'ip')),
  subject_key text not null,
  failure_count integer not null default 0 check (failure_count >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (subject_type, subject_key)
);

create index if not exists login_attempt_state_locked_until_idx
  on public.login_attempt_state (locked_until)
  where locked_until is not null;

alter table public.login_attempt_state enable row level security;
revoke all on public.login_attempt_state from public, anon, authenticated;

-- 若前序迁移未部署，补齐配置读取函数
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

-- 登录前检查：邮箱或 IP 任一仍在冷却期内则拒绝
create or replace function public.check_login_allowed(p_email text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_hash text;
  v_max integer;
  v_minutes integer;
  v_email_locked timestamptz;
  v_ip_locked timestamptz;
  v_email_failures integer := 0;
  v_ip_failures integer := 0;
  v_locked_until timestamptz;
  v_reason text := null;
  v_remaining integer := 0;
begin
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null or position('@' in v_email) = 0 or length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  if v_hash is null or length(v_hash) < 8 or length(v_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;

  v_max := public.get_platform_config_int('login_failure_max_attempts', 5);
  v_minutes := public.get_platform_config_int('login_cooldown_minutes', 15);

  select failure_count, locked_until into v_email_failures, v_email_locked
  from public.login_attempt_state
  where subject_type = 'email' and subject_key = v_email;

  select failure_count, locked_until into v_ip_failures, v_ip_locked
  from public.login_attempt_state
  where subject_type = 'ip' and subject_key = v_hash;

  v_email_failures := coalesce(v_email_failures, 0);
  v_ip_failures := coalesce(v_ip_failures, 0);

  if v_email_locked is not null and v_email_locked > now() then
    v_locked_until := v_email_locked;
    v_reason := 'email_lock';
  elsif v_ip_locked is not null and v_ip_locked > now() then
    v_locked_until := v_ip_locked;
    v_reason := 'ip_lock';
  end if;

  if v_locked_until is not null then
    v_remaining := greatest(ceil(extract(epoch from (v_locked_until - now())) / 60.0)::integer, 1);
  end if;

  return jsonb_build_object(
    'allowed', v_locked_until is null,
    'max_attempts', v_max,
    'cooldown_minutes', v_minutes,
    'email_failures', v_email_failures,
    'ip_failures', v_ip_failures,
    'locked_until', case when v_locked_until is null then null else to_char(v_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'remaining_minutes', v_remaining,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.check_login_allowed(text, text) from public, anon, authenticated;

-- 登录失败记账；达到上限则写入锁定截止时间（邮箱与 IP 分别计数）
create or replace function public.record_login_failure(p_email text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_hash text;
  v_max integer;
  v_minutes integer;
  v_email_count integer;
  v_ip_count integer;
  v_email_locked timestamptz;
  v_ip_locked timestamptz;
  v_locked_until timestamptz;
  v_reason text := null;
begin
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null or position('@' in v_email) = 0 or length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  if v_hash is null or length(v_hash) < 8 or length(v_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;

  v_max := greatest(public.get_platform_config_int('login_failure_max_attempts', 5), 1);
  v_minutes := greatest(public.get_platform_config_int('login_cooldown_minutes', 15), 1);

  -- 若已在冷却中，直接返回（不叠加失败次数）
  select locked_until into v_email_locked
  from public.login_attempt_state
  where subject_type = 'email' and subject_key = v_email;

  select locked_until into v_ip_locked
  from public.login_attempt_state
  where subject_type = 'ip' and subject_key = v_hash;

  if v_email_locked is not null and v_email_locked > now() then
    return jsonb_build_object(
      'recorded', false,
      'reason', 'email_lock',
      'locked_until', to_char(v_email_locked at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'remaining_minutes', greatest(ceil(extract(epoch from (v_email_locked - now())) / 60.0)::integer, 1),
      'max_attempts', v_max,
      'cooldown_minutes', v_minutes
    );
  end if;

  if v_ip_locked is not null and v_ip_locked > now() then
    return jsonb_build_object(
      'recorded', false,
      'reason', 'ip_lock',
      'locked_until', to_char(v_ip_locked at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'remaining_minutes', greatest(ceil(extract(epoch from (v_ip_locked - now())) / 60.0)::integer, 1),
      'max_attempts', v_max,
      'cooldown_minutes', v_minutes
    );
  end if;

  insert into public.login_attempt_state(subject_type, subject_key, failure_count, locked_until, updated_at)
  values ('email', v_email, 1, null, now())
  on conflict (subject_type, subject_key) do update
  set failure_count = case
        when public.login_attempt_state.locked_until is not null
          and public.login_attempt_state.locked_until <= now()
        then 1
        else public.login_attempt_state.failure_count + 1
      end,
      locked_until = null,
      updated_at = now()
  returning failure_count into v_email_count;

  insert into public.login_attempt_state(subject_type, subject_key, failure_count, locked_until, updated_at)
  values ('ip', v_hash, 1, null, now())
  on conflict (subject_type, subject_key) do update
  set failure_count = case
        when public.login_attempt_state.locked_until is not null
          and public.login_attempt_state.locked_until <= now()
        then 1
        else public.login_attempt_state.failure_count + 1
      end,
      locked_until = null,
      updated_at = now()
  returning failure_count into v_ip_count;

  if v_email_count >= v_max then
    v_locked_until := now() + make_interval(mins => v_minutes);
    update public.login_attempt_state
    set locked_until = v_locked_until, updated_at = now()
    where subject_type = 'email' and subject_key = v_email;
    v_reason := 'email_lock';
  end if;

  if v_ip_count >= v_max then
    v_locked_until := coalesce(v_locked_until, now() + make_interval(mins => v_minutes));
    if v_reason is null then
      v_locked_until := now() + make_interval(mins => v_minutes);
      v_reason := 'ip_lock';
    end if;
    update public.login_attempt_state
    set locked_until = v_locked_until, updated_at = now()
    where subject_type = 'ip' and subject_key = v_hash;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'email_failures', v_email_count,
    'ip_failures', v_ip_count,
    'max_attempts', v_max,
    'cooldown_minutes', v_minutes,
    'locked', v_locked_until is not null,
    'reason', v_reason,
    'locked_until', case when v_locked_until is null then null else to_char(v_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'remaining_minutes', case when v_locked_until is null then 0 else greatest(ceil(extract(epoch from (v_locked_until - now())) / 60.0)::integer, 1) end
  );
end;
$$;

revoke all on function public.record_login_failure(text, text) from public, anon, authenticated;

-- 登录成功：清零该邮箱与该 IP 的失败计数与锁定
create or replace function public.clear_login_failures(p_email text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_hash text;
begin
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null or position('@' in v_email) = 0 or length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  if v_hash is null or length(v_hash) < 8 or length(v_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;

  delete from public.login_attempt_state
  where (subject_type = 'email' and subject_key = v_email)
     or (subject_type = 'ip' and subject_key = v_hash);

  return jsonb_build_object('cleared', true);
end;
$$;

revoke all on function public.clear_login_failures(text, text) from public, anon, authenticated;

commit;
