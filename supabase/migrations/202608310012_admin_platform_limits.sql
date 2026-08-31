-- A-07 限额配置页：管理端可改 platform_config 全部数量类限额
-- 保存后立即生效；非法值拒绝；写 admin 审计。
-- 试用天数供 A-01 发放试用缺省读取。

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
  ('registration_success_per_ip_per_day', '3'::jsonb),
  ('otp_per_email_per_hour', '3'::jsonb),
  ('otp_per_ip_per_hour', '10'::jsonb),
  ('login_failure_max_attempts', '5'::jsonb),
  ('login_cooldown_minutes', '15'::jsonb),
  ('password_reset_per_email_per_hour', '3'::jsonb),
  ('password_reset_per_ip_per_hour', '10'::jsonb),
  ('trial_days', '14'::jsonb),
  ('invite_reward_months', '3'::jsonb),
  ('edge_function_daily_call_limit', '10000'::jsonb),
  ('match_date_near_days', '3'::jsonb),
  ('match_amount_tolerance_cents', '0'::jsonb),
  ('backup_stale_days', '7'::jsonb),
  ('aging_bucket_1_days', '30'::jsonb),
  ('aging_bucket_2_days', '60'::jsonb),
  ('aging_bucket_3_days', '90'::jsonb)
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

-- A-01 发放试用：缺省天数读 trial_days 配置
create or replace function public.admin_grant_entitlement(
  p_user_id uuid,
  p_plan_code text,
  p_days integer default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_plan text;
  v_days integer;
  v_ends timestamptz;
  v_id uuid;
  v_source text;
  v_trial_default integer;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  v_plan := lower(trim(coalesce(p_plan_code, '')));
  if v_plan not in ('pro_trial', 'pro') then
    raise exception 'invalid plan';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'user not found';
  end if;

  v_trial_default := greatest(public.get_platform_config_int('trial_days', 14), 1);

  if v_plan = 'pro_trial' then
    v_days := coalesce(nullif(p_days, 0), v_trial_default);
    if v_days < 1 or v_days > 3650 then
      raise exception 'invalid days';
    end if;
    v_ends := now() + make_interval(days => v_days);
    v_source := 'admin_trial';
  else
    if p_days is null or p_days = 0 then
      v_days := null;
      v_ends := null;
    else
      v_days := p_days;
      if v_days < 1 or v_days > 3650 then
        raise exception 'invalid days';
      end if;
      v_ends := now() + make_interval(days => v_days);
    end if;
    v_source := 'admin_grant';
  end if;

  insert into public.entitlement_grants(user_id, plan_code, source, starts_at, ends_at, metadata)
  values (
    p_user_id,
    v_plan,
    v_source,
    now(),
    v_ends,
    jsonb_build_object(
      'granted_by', auth.uid(),
      'note', nullif(left(trim(coalesce(p_note, '')), 200), ''),
      'days', v_days
    )
  )
  returning id into v_id;

  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'grant_entitlement',
    'admin',
    '/admin/',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'target_email', v_email,
      'plan_code', v_plan,
      'days', v_days,
      'ends_at', v_ends,
      'grant_id', v_id
    )
  );
  return v_id;
end;
$$;

revoke all on function public.admin_grant_entitlement(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_grant_entitlement(uuid, text, integer, text) to authenticated;

commit;
