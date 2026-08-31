-- A-05 后台待办：新留言、待跟进意向、今日异常注册

begin;

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
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_today := (now() at time zone 'Asia/Shanghai')::date;
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

  if to_regprocedure('public.get_platform_config_int(text, integer)') is not null then
    v_ip_limit := public.get_platform_config_int('registration_success_per_ip_per_day', 3);
  end if;

  -- 今日异常注册：当日停用账号 + 同一 IP 达到当日注册上限的用户（去重）
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

  return jsonb_build_object(
    'new_users_today', v_new_users,
    'signins_today', v_signins,
    'open_intents', v_open_intents,
    'new_feedback', v_new_feedback,
    'abnormal_registrations_today', coalesce(v_abnormal, 0)
  );
end;
$$;
revoke all on function public.admin_overview_stats() from public, anon;
grant execute on function public.admin_overview_stats() to authenticated;

commit;
