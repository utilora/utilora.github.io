-- S-21–S-24：登录空闲超时、二次验证失败次数进入限额；MFA 冷却 RPC；空闲分钟只读接口。
-- 登录失败记账 2 秒内去抖，避免页面与 Auth Hook 各记一次。

insert into public.platform_config(key, value)
values
  ('idle_timeout_minutes', '30'::jsonb),
  ('mfa_failure_max_attempts', '5'::jsonb)
on conflict (key) do nothing;

alter table public.login_attempt_state
  drop constraint if exists login_attempt_state_subject_type_check;

alter table public.login_attempt_state
  add constraint login_attempt_state_subject_type_check
  check (subject_type in ('email', 'ip', 'mfa'));

create or replace function public.admin_list_platform_limits()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rec record;
  item jsonb;
  items jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;

  for rec in
    select * from (
      values
        ('registration_success_per_ip_per_day', 3, '每 IP 每天成功注册次数', 'security', 1, 100),
        ('otp_per_email_per_hour', 3, '每邮箱每小时验证码', 'security', 1, 50),
        ('otp_per_ip_per_hour', 10, '每 IP 每小时验证码', 'security', 1, 200),
        ('login_failure_max_attempts', 5, '登录连续失败次数', 'security', 1, 30),
        ('login_cooldown_minutes', 15, '登录冷却分钟', 'security', 1, 1440),
        ('mfa_failure_max_attempts', 5, '二次验证连续失败次数', 'security', 1, 30),
        ('idle_timeout_minutes', 30, '登录空闲超时分钟', 'security', 5, 1440),
        ('password_reset_per_email_per_hour', 3, '每邮箱每小时找回密码', 'security', 1, 50),
        ('password_reset_per_ip_per_hour', 10, '每 IP 每小时找回密码', 'security', 1, 200),
        ('feedback_per_user_per_hour', 5, '每用户每小时留言', 'security', 1, 50),
        ('feedback_per_ip_per_hour', 10, '每 IP 每小时留言', 'security', 1, 200),
        ('purchase_intent_per_email_per_hour', 3, '每邮箱每小时购买意向', 'security', 1, 50),
        ('purchase_intent_per_ip_per_hour', 10, '每 IP 每小时购买意向', 'security', 1, 200),
        ('trial_days', 14, '试用天数', 'ops', 1, 365),
        ('trial_expiry_warn_days', 7, '试用到期预警天数', 'ops', 1, 30),
        ('invite_reward_months', 3, '邀请成功奖励月数', 'ops', 1, 24),
        ('edge_function_daily_call_limit', 10000, 'Edge Function 每日调用上限', 'security', 1, 1000000),
        ('match_date_near_days', 3, '匹配日期接近天数', 'ops', 0, 30),
        ('match_amount_tolerance_cents', 0, '匹配金额容差（分）', 'ops', 0, 100),
        ('backup_stale_days', 7, '备份过期天数', 'ops', 1, 90),
        ('aging_bucket_1_days', 30, '账龄桶1上限天', 'ops', 1, 365),
        ('aging_bucket_2_days', 60, '账龄桶2上限天', 'ops', 1, 365),
        ('aging_bucket_3_days', 90, '账龄桶3上限天', 'ops', 1, 365)
    ) as spec(key, default_value, label, group_name, min_value, max_value)
  loop
    item := jsonb_build_object(
      'key', rec.key,
      'label', rec.label,
      'group', rec.group_name,
      'default_value', rec.default_value,
      'min', rec.min_value,
      'max', rec.max_value,
      'value', public.get_platform_config_int(rec.key, rec.default_value)
    );
    items := items || jsonb_build_array(item);
  end loop;

  return jsonb_build_object('items', items);
end;
$$;

revoke all on function public.admin_list_platform_limits() from public, anon;
grant execute on function public.admin_list_platform_limits() to authenticated;

create or replace function public.admin_set_platform_limits(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_map jsonb := '{}'::jsonb;
  v_key text;
  v_raw text;
  v_num integer;
  v_old integer;
  rec record;
  v_changes jsonb := '[]'::jsonb;
  v_b1 integer;
  v_b2 integer;
  v_b3 integer;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'object' then
    raise exception 'invalid payload';
  end if;

  for rec in
    select * from (
      values
        ('registration_success_per_ip_per_day', 3, '每 IP 每天成功注册次数', 1, 100),
        ('otp_per_email_per_hour', 3, '每邮箱每小时验证码', 1, 50),
        ('otp_per_ip_per_hour', 10, '每 IP 每小时验证码', 1, 200),
        ('login_failure_max_attempts', 5, '登录连续失败次数', 1, 30),
        ('login_cooldown_minutes', 15, '登录冷却分钟', 1, 1440),
        ('mfa_failure_max_attempts', 5, '二次验证连续失败次数', 1, 30),
        ('idle_timeout_minutes', 30, '登录空闲超时分钟', 5, 1440),
        ('password_reset_per_email_per_hour', 3, '每邮箱每小时找回密码', 1, 50),
        ('password_reset_per_ip_per_hour', 10, '每 IP 每小时找回密码', 1, 200),
        ('feedback_per_user_per_hour', 5, '每用户每小时留言', 1, 50),
        ('feedback_per_ip_per_hour', 10, '每 IP 每小时留言', 1, 200),
        ('purchase_intent_per_email_per_hour', 3, '每邮箱每小时购买意向', 1, 50),
        ('purchase_intent_per_ip_per_hour', 10, '每 IP 每小时购买意向', 1, 200),
        ('trial_days', 14, '试用天数', 1, 365),
        ('trial_expiry_warn_days', 7, '试用到期预警天数', 1, 30),
        ('invite_reward_months', 3, '邀请成功奖励月数', 1, 24),
        ('edge_function_daily_call_limit', 10000, 'Edge Function 每日调用上限', 1, 1000000),
        ('match_date_near_days', 3, '匹配日期接近天数', 0, 30),
        ('match_amount_tolerance_cents', 0, '匹配金额容差（分）', 0, 100),
        ('backup_stale_days', 7, '备份过期天数', 1, 90),
        ('aging_bucket_1_days', 30, '账龄桶1上限天', 1, 365),
        ('aging_bucket_2_days', 60, '账龄桶2上限天', 1, 365),
        ('aging_bucket_3_days', 90, '账龄桶3上限天', 1, 365)
    ) as spec(key, default_value, label, min_value, max_value)
  loop
    if p_items ? rec.key then
      v_raw := p_items ->> rec.key;
      begin
        v_num := trim(v_raw)::integer;
      exception when others then
        raise exception '% 须为整数', rec.label;
      end;
      if v_num is null or v_num < rec.min_value or v_num > rec.max_value then
        raise exception '% 须为 %–% 的整数', rec.label, rec.min_value, rec.max_value;
      end if;
      v_map := v_map || jsonb_build_object(rec.key, v_num);
    end if;
  end loop;

  if v_map = '{}'::jsonb then
    raise exception '没有可保存的限额';
  end if;

  v_b1 := coalesce((v_map ->> 'aging_bucket_1_days')::integer, public.get_platform_config_int('aging_bucket_1_days', 30));
  v_b2 := coalesce((v_map ->> 'aging_bucket_2_days')::integer, public.get_platform_config_int('aging_bucket_2_days', 60));
  v_b3 := coalesce((v_map ->> 'aging_bucket_3_days')::integer, public.get_platform_config_int('aging_bucket_3_days', 90));
  if not (v_b1 > 0 and v_b1 < v_b2 and v_b2 < v_b3 and v_b3 <= 365) then
    raise exception '账龄分桶须满足 0 < 桶1 < 桶2 < 桶3 ≤ 365';
  end if;

  for v_key in select jsonb_object_keys(v_map)
  loop
    v_num := (v_map ->> v_key)::integer;
    v_old := public.get_platform_config_int(v_key, null);
    insert into public.platform_config(key, value, updated_at)
    values (v_key, to_jsonb(v_num), now())
    on conflict (key) do update
      set value = excluded.value,
          updated_at = now();
    if v_old is distinct from v_num then
      v_changes := v_changes || jsonb_build_array(jsonb_build_object(
        'key', v_key,
        'from', v_old,
        'to', v_num
      ));
    end if;
  end loop;

  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'update_platform_limits',
    'admin',
    '/admin/',
    jsonb_build_object('changes', v_changes, 'values', v_map)
  );

  return public.admin_list_platform_limits() || jsonb_build_object('changed', v_changes);
end;
$$;

revoke all on function public.admin_set_platform_limits(jsonb) from public, anon;
grant execute on function public.admin_set_platform_limits(jsonb) to authenticated;

create or replace function public.get_idle_timeout_minutes()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  v := public.get_platform_config_int('idle_timeout_minutes', 30);
  if v < 5 or v > 1440 then
    return 30;
  end if;
  return v;
end;
$$;

revoke all on function public.get_idle_timeout_minutes() from public, anon;
grant execute on function public.get_idle_timeout_minutes() to authenticated;

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
        when public.login_attempt_state.updated_at >= now() - interval '2 seconds'
        then public.login_attempt_state.failure_count
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
        when public.login_attempt_state.updated_at >= now() - interval '2 seconds'
        then public.login_attempt_state.failure_count
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

create or replace function public.check_mfa_allowed(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_max integer;
  v_minutes integer;
  v_failures integer := 0;
  v_locked timestamptz;
  v_remaining integer := 0;
begin
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null or position('@' in v_email) = 0 or length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  v_max := greatest(public.get_platform_config_int('mfa_failure_max_attempts', 5), 1);
  v_minutes := greatest(public.get_platform_config_int('login_cooldown_minutes', 15), 1);

  select failure_count, locked_until into v_failures, v_locked
  from public.login_attempt_state
  where subject_type = 'mfa' and subject_key = v_email;

  v_failures := coalesce(v_failures, 0);
  if v_locked is not null and v_locked > now() then
    v_remaining := greatest(ceil(extract(epoch from (v_locked - now())) / 60.0)::integer, 1);
  else
    v_locked := null;
  end if;

  return jsonb_build_object(
    'allowed', v_locked is null,
    'max_attempts', v_max,
    'cooldown_minutes', v_minutes,
    'failures', v_failures,
    'locked_until', case when v_locked is null then null else to_char(v_locked at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'remaining_minutes', v_remaining,
    'reason', case when v_locked is null then null else 'mfa_lock' end
  );
end;
$$;

revoke all on function public.check_mfa_allowed(text) from public, anon, authenticated;

create or replace function public.record_mfa_failure(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_max integer;
  v_minutes integer;
  v_count integer;
  v_locked timestamptz;
  v_locked_until timestamptz;
begin
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null or position('@' in v_email) = 0 or length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  v_max := greatest(public.get_platform_config_int('mfa_failure_max_attempts', 5), 1);
  v_minutes := greatest(public.get_platform_config_int('login_cooldown_minutes', 15), 1);

  select locked_until into v_locked
  from public.login_attempt_state
  where subject_type = 'mfa' and subject_key = v_email;

  if v_locked is not null and v_locked > now() then
    return jsonb_build_object(
      'recorded', false,
      'reason', 'mfa_lock',
      'locked_until', to_char(v_locked at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'remaining_minutes', greatest(ceil(extract(epoch from (v_locked - now())) / 60.0)::integer, 1),
      'max_attempts', v_max,
      'cooldown_minutes', v_minutes
    );
  end if;

  insert into public.login_attempt_state(subject_type, subject_key, failure_count, locked_until, updated_at)
  values ('mfa', v_email, 1, null, now())
  on conflict (subject_type, subject_key) do update
  set failure_count = case
        when public.login_attempt_state.locked_until is not null
          and public.login_attempt_state.locked_until <= now()
        then 1
        when public.login_attempt_state.updated_at >= now() - interval '2 seconds'
        then public.login_attempt_state.failure_count
        else public.login_attempt_state.failure_count + 1
      end,
      locked_until = null,
      updated_at = now()
  returning failure_count into v_count;

  if v_count >= v_max then
    v_locked_until := now() + make_interval(mins => v_minutes);
    update public.login_attempt_state
    set locked_until = v_locked_until, updated_at = now()
    where subject_type = 'mfa' and subject_key = v_email;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'failures', v_count,
    'max_attempts', v_max,
    'cooldown_minutes', v_minutes,
    'locked', v_locked_until is not null,
    'reason', case when v_locked_until is null then null else 'mfa_lock' end,
    'locked_until', case when v_locked_until is null then null else to_char(v_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
    'remaining_minutes', case when v_locked_until is null then 0 else greatest(ceil(extract(epoch from (v_locked_until - now())) / 60.0)::integer, 1) end
  );
end;
$$;

revoke all on function public.record_mfa_failure(text) from public, anon, authenticated;

create or replace function public.clear_mfa_failures(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null or position('@' in v_email) = 0 or length(v_email) > 320 then
    raise exception 'invalid email';
  end if;

  delete from public.login_attempt_state
  where subject_type = 'mfa' and subject_key = v_email;

  return jsonb_build_object('cleared', true);
end;
$$;

revoke all on function public.clear_mfa_failures(text) from public, anon, authenticated;
