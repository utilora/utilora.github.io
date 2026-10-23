-- 试用到期预警 + 用户详情补全：预警天数可配；工作台列出即将到期；档案含二次验证、会话、登录地点。

insert into public.platform_config(key, value)
values ('trial_expiry_warn_days', '7'::jsonb)
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

create or replace function public.admin_overview_stats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_new_users integer;
  v_signins integer;
  v_open_intents integer;
  v_new_feedback integer;
  v_abnormal integer := 0;
  v_ip_limit integer := 3;
  v_warn integer := 7;
  v_expiring integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_today := (now() at time zone 'Asia/Shanghai')::date;
  if to_regprocedure('public.get_platform_config_int(text, integer)') is not null then
    v_ip_limit := public.get_platform_config_int('registration_success_per_ip_per_day', 3);
    v_warn := public.get_platform_config_int('trial_expiry_warn_days', 7);
  end if;
  v_warn := greatest(1, least(coalesce(v_warn, 7), 30));

  select count(*)::int into v_new_users
  from auth.users
  where (created_at at time zone 'Asia/Shanghai')::date = v_today;
  select count(*)::int into v_signins
  from auth.users
  where last_sign_in_at is not null
    and (last_sign_in_at at time zone 'Asia/Shanghai')::date = v_today;
  select count(*)::int into v_open_intents
  from public.purchase_intents i
  left join public.purchase_intent_followups f on f.intent_id = i.id
  where coalesce(f.status, 'new') <> 'closed';
  v_new_feedback := 0;
  if to_regclass('public.feedback') is not null then
    execute 'select count(*)::int from public.feedback where status = ''new''' into v_new_feedback;
  end if;

  if to_regclass('public.registration_ip_log') is not null then
    execute $q$
      select count(*)::int from (
        select u.id
        from auth.users u
        left join public.user_flags f on f.user_id = u.id
        where (u.created_at at time zone 'Asia/Shanghai')::date = $1
          and coalesce(f.is_disabled, false)
        union
        select r.user_id
        from public.registration_ip_log r
        where r.reg_day = $1
          and r.user_id is not null
          and r.ip_hash in (
            select ip_hash from public.registration_ip_log
            where reg_day = $1
            group by ip_hash
            having count(*) >= $2
          )
      ) x
    $q$ into v_abnormal using v_today, v_ip_limit;
  else
    select count(*)::int into v_abnormal
    from auth.users u
    left join public.user_flags f on f.user_id = u.id
    where (u.created_at at time zone 'Asia/Shanghai')::date = v_today
      and coalesce(f.is_disabled, false);
  end if;

  if to_regclass('public.entitlement_grants') is not null then
    select count(*)::int into v_expiring
    from (
      select distinct g.user_id
      from public.entitlement_grants g
      where g.starts_at <= now()
        and g.ends_at is not null
        and g.ends_at > now()
        and g.ends_at <= now() + make_interval(days => v_warn)
    ) expiring_users;
    select coalesce(jsonb_agg(item order by ends_at), '[]'::jsonb)
      into v_items
    from (
      select jsonb_build_object(
        'user_id', x.user_id,
        'email', x.email,
        'plan_code', x.plan_code,
        'ends_at', x.ends_at,
        'days_left', x.days_left
      ) as item,
      x.ends_at
      from (
        select distinct on (g.user_id)
          g.user_id,
          u.email,
          g.plan_code,
          g.ends_at,
          greatest(0, ceil(extract(epoch from (g.ends_at - now())) / 86400.0))::int as days_left
        from public.entitlement_grants g
        left join auth.users u on u.id = g.user_id
        where g.starts_at <= now()
          and g.ends_at is not null
          and g.ends_at > now()
          and g.ends_at <= now() + make_interval(days => v_warn)
        order by g.user_id, g.ends_at
      ) x
      order by x.ends_at
      limit 20
    ) listed;
  end if;

  return jsonb_build_object(
    'new_users_today', v_new_users,
    'signins_today', v_signins,
    'open_intents', v_open_intents,
    'new_feedback', v_new_feedback,
    'abnormal_registrations_today', coalesce(v_abnormal, 0),
    'expiring_trials', coalesce(v_expiring, 0),
    'expiring_items', coalesce(v_items, '[]'::jsonb),
    'trial_expiry_warn_days', v_warn
  );
end;
$$;

revoke all on function public.admin_overview_stats() from public, anon;
grant execute on function public.admin_overview_stats() to authenticated;

create or replace function public.admin_user_dossier(p_user_id uuid default null, p_email text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_current uuid;
  v_mfa boolean := false;
  v_sessions jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
  v_grants jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;

  select
    u.id,
    u.email,
    coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(coalesce(u.email, ''), '@', 1)) as name,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    exists (select 1 from public.admin_users a where a.user_id = u.id) as is_admin,
    coalesce(f.is_disabled, false) as is_disabled
  into v_user
  from auth.users u
  left join public.user_flags f on f.user_id = u.id
  where (p_user_id is not null and u.id = p_user_id)
     or (p_user_id is null and p_email is not null and lower(u.email) = lower(trim(p_email)))
  order by u.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  begin
    v_current := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_current := null;
  end;

  begin
    select exists(
      select 1 from auth.mfa_factors
      where user_id = v_user.id and status = 'verified'
    ) into v_mfa;
  exception when others then
    v_mfa := false;
  end;

  begin
    select coalesce(jsonb_agg(item order by last_active desc), '[]'::jsonb)
      into v_sessions
    from (
      select jsonb_build_object(
        'session_id', s.id,
        'user_id', s.user_id,
        'last_active', coalesce(s.updated_at, s.created_at),
        'user_agent', left(coalesce(s.user_agent, ''), 180),
        'online', coalesce(s.updated_at, s.created_at) > now() - interval '30 minutes',
        'is_current', v_current is not null and s.id = v_current
      ) as item,
      coalesce(s.updated_at, s.created_at) as last_active
      from auth.sessions s
      where s.user_id = v_user.id
        and (s.not_after is null or s.not_after > now())
      order by last_active desc
      limit 20
    ) q;
  exception when others then
    select coalesce(jsonb_agg(item order by last_active desc), '[]'::jsonb)
      into v_sessions
    from (
      select jsonb_build_object(
        'session_id', s.id,
        'user_id', s.user_id,
        'last_active', coalesce(s.updated_at, s.created_at),
        'user_agent', '',
        'online', coalesce(s.updated_at, s.created_at) > now() - interval '30 minutes',
        'is_current', v_current is not null and s.id = v_current
      ) as item,
      coalesce(s.updated_at, s.created_at) as last_active
      from auth.sessions s
      where s.user_id = v_user.id
      order by last_active desc
      limit 20
    ) q;
  end;

  if to_regclass('public.login_locations') is not null then
    select coalesce(jsonb_agg(item order by last_seen desc), '[]'::jsonb)
      into v_locations
    from (
      select jsonb_build_object(
        'network', left(ip_hash, 8),
        'first_seen', first_seen,
        'last_seen', last_seen
      ) as item,
      last_seen
      from public.login_locations
      where user_id = v_user.id
      order by last_seen desc
      limit 8
    ) loc;
  end if;

  if to_regclass('public.entitlement_grants') is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.starts_at desc), '[]'::jsonb)
      into v_grants
    from (
      select g.id, g.plan_code, g.source, g.starts_at, g.ends_at
      from public.entitlement_grants g
      where g.user_id = v_user.id
      order by g.starts_at desc
      limit 20
    ) t;
  end if;

  return jsonb_build_object(
    'found', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'name', v_user.name,
      'created_at', v_user.created_at,
      'last_sign_in_at', v_user.last_sign_in_at,
      'email_confirmed_at', v_user.email_confirmed_at,
      'is_admin', v_user.is_admin,
      'is_disabled', v_user.is_disabled
    ),
    'mfa_enabled', coalesce(v_mfa, false),
    'sessions', coalesce(v_sessions, '[]'::jsonb),
    'locations', coalesce(v_locations, '[]'::jsonb),
    'grants', coalesce(v_grants, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_user_dossier(uuid, text) from public, anon;
grant execute on function public.admin_user_dossier(uuid, text) to authenticated;
