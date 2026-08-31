-- 二次验证配套：登录地点表；限额页补留言/购买意向四项。
-- 二次验证本身走账号服务 TOTP，不另建表。

insert into public.platform_config(key, value)
values
  ('feedback_per_user_per_hour', '5'::jsonb),
  ('feedback_per_ip_per_hour', '10'::jsonb),
  ('purchase_intent_per_email_per_hour', '3'::jsonb),
  ('purchase_intent_per_ip_per_hour', '10'::jsonb)
on conflict (key) do nothing;

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
        ('password_reset_per_email_per_hour', 3, '每邮箱每小时找回密码', 'security', 1, 50),
        ('password_reset_per_ip_per_hour', 10, '每 IP 每小时找回密码', 'security', 1, 200),
        ('feedback_per_user_per_hour', 5, '每用户每小时留言', 'security', 1, 50),
        ('feedback_per_ip_per_hour', 10, '每 IP 每小时留言', 'security', 1, 200),
        ('purchase_intent_per_email_per_hour', 3, '每邮箱每小时购买意向', 'security', 1, 50),
        ('purchase_intent_per_ip_per_hour', 10, '每 IP 每小时购买意向', 'security', 1, 200),
        ('trial_days', 14, '试用天数', 'ops', 1, 365),
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
        ('password_reset_per_email_per_hour', 3, '每邮箱每小时找回密码', 1, 50),
        ('password_reset_per_ip_per_hour', 10, '每 IP 每小时找回密码', 1, 200),
        ('feedback_per_user_per_hour', 5, '每用户每小时留言', 1, 50),
        ('feedback_per_ip_per_hour', 10, '每 IP 每小时留言', 1, 200),
        ('purchase_intent_per_email_per_hour', 3, '每邮箱每小时购买意向', 1, 50),
        ('purchase_intent_per_ip_per_hour', 10, '每 IP 每小时购买意向', 1, 200),
        ('trial_days', 14, '试用天数', 1, 365),
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

create table if not exists public.login_locations (
  user_id uuid not null,
  ip_hash text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  notify_sent boolean not null default false,
  primary key (user_id, ip_hash)
);

alter table public.login_locations enable row level security;
revoke all on public.login_locations from public, anon, authenticated;

create or replace function public.record_login_location(p_user_id uuid, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  if p_user_id is null or p_ip_hash is null or length(trim(p_ip_hash)) < 16 then
    raise exception 'invalid location';
  end if;
  select exists(
    select 1 from public.login_locations
    where user_id = p_user_id and ip_hash = p_ip_hash
  ) into v_exists;
  if v_exists then
    update public.login_locations
      set last_seen = now()
      where user_id = p_user_id and ip_hash = p_ip_hash;
    return jsonb_build_object('new_location', false);
  end if;
  insert into public.login_locations(user_id, ip_hash)
  values (p_user_id, trim(p_ip_hash));
  return jsonb_build_object('new_location', true);
end;
$$;

revoke all on function public.record_login_location(uuid, text) from public, anon, authenticated;
grant execute on function public.record_login_location(uuid, text) to service_role;

create or replace function public.list_my_login_locations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise insufficient_privilege;
  end if;
  return coalesce((
    select jsonb_agg(item order by last_seen desc)
    from (
      select jsonb_build_object(
        'network', left(ip_hash, 8),
        'first_seen', first_seen,
        'last_seen', last_seen
      ) as item,
      last_seen
      from public.login_locations
      where user_id = auth.uid()
      order by last_seen desc
      limit 8
    ) rows
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_login_locations() from public, anon;
grant execute on function public.list_my_login_locations() to authenticated;

grant select, insert, update on public.login_locations to service_role;
grant insert on public.user_activity_logs to service_role;
