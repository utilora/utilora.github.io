-- A-02 风控台：今日注册、每 IP 注册次数、验证码发送次数；一键停用复用 admin_set_user_disabled
-- 只读聚合；IP/验证码明细依赖安全线表 registration_ip_log / otp_send_log（若不存在则返回空数组）

begin;

create or replace function public.admin_risk_console()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_since_hour timestamptz;
  v_new_users jsonb := '[]'::jsonb;
  v_ip_regs jsonb := '[]'::jsonb;
  v_otp_email jsonb := '[]'::jsonb;
  v_otp_ip jsonb := '[]'::jsonb;
  v_new_count integer := 0;
  v_ip_limit integer := 3;
  v_otp_email_limit integer := 3;
  v_otp_ip_limit integer := 10;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;

  v_today := (now() at time zone 'Asia/Shanghai')::date;
  v_since_hour := now() - interval '1 hour';

  if to_regprocedure('public.get_platform_config_int(text, integer)') is not null then
    v_ip_limit := public.get_platform_config_int('registration_success_per_ip_per_day', 3);
    v_otp_email_limit := public.get_platform_config_int('otp_per_email_per_hour', 3);
    v_otp_ip_limit := public.get_platform_config_int('otp_per_ip_per_hour', 10);
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb), count(*)::int
  into v_new_users, v_new_count
  from (
    select
      u.id,
      u.email,
      coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(coalesce(u.email, ''), '@', 1)) as name,
      u.created_at,
      u.email_confirmed_at,
      coalesce(f.is_disabled, false) as is_disabled
    from auth.users u
    left join public.user_flags f on f.user_id = u.id
    where (u.created_at at time zone 'Asia/Shanghai')::date = v_today
  ) t;

  if to_regclass('public.registration_ip_log') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x) order by x.used desc, x.ip_hash), '[]'::jsonb)
      from (
        select
          r.ip_hash,
          count(*)::int as used,
          $1::int as limit_value,
          array_agg(r.user_id) filter (where r.user_id is not null) as user_ids
        from public.registration_ip_log r
        where r.reg_day = $2
        group by r.ip_hash
      ) x
    $q$ into v_ip_regs using v_ip_limit, v_today;
  end if;

  if to_regclass('public.otp_send_log') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x) order by x.used desc, x.email_norm), '[]'::jsonb)
      from (
        select
          o.email_norm,
          count(*)::int as used,
          $1::int as limit_value
        from public.otp_send_log o
        where o.created_at >= $2
        group by o.email_norm
      ) x
    $q$ into v_otp_email using v_otp_email_limit, v_since_hour;

    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x) order by x.used desc, x.ip_hash), '[]'::jsonb)
      from (
        select
          o.ip_hash,
          count(*)::int as used,
          $1::int as limit_value
        from public.otp_send_log o
        where o.created_at >= $2
        group by o.ip_hash
      ) x
    $q$ into v_otp_ip using v_otp_ip_limit, v_since_hour;
  end if;

  return jsonb_build_object(
    'day', to_char(v_today, 'YYYY-MM-DD'),
    'new_users_today', coalesce(v_new_count, 0),
    'new_users', coalesce(v_new_users, '[]'::jsonb),
    'registration_ip_today', coalesce(v_ip_regs, '[]'::jsonb),
    'otp_by_email_last_hour', coalesce(v_otp_email, '[]'::jsonb),
    'otp_by_ip_last_hour', coalesce(v_otp_ip, '[]'::jsonb),
    'limits', jsonb_build_object(
      'registration_success_per_ip_per_day', v_ip_limit,
      'otp_per_email_per_hour', v_otp_email_limit,
      'otp_per_ip_per_hour', v_otp_ip_limit
    ),
    'tables_ready', jsonb_build_object(
      'registration_ip_log', to_regclass('public.registration_ip_log') is not null,
      'otp_send_log', to_regclass('public.otp_send_log') is not null
    )
  );
end;
$$;

revoke all on function public.admin_risk_console() from public, anon;
grant execute on function public.admin_risk_console() to authenticated;

commit;
