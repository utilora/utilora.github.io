-- 留言绑账号、意向真发放、今日回访、关限免冲击、档案补全、登录冷却解锁、公告预约与关闭数
begin;

alter table public.feedback
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists feedback_user_id_idx on public.feedback (user_id);

create or replace function public.admin_list_feedback(
  p_status text default null,
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  v_status text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is not null and v_status not in ('new', 'processing', 'completed', 'closed') then
    raise exception 'invalid status';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      f.id,
      f.created_at,
      f.name,
      f.title,
      f.message,
      f.contact,
      f.status,
      f.user_id,
      u.email as user_email
    from public.feedback f
    left join auth.users u on u.id = f.user_id
    where (v_status is null or f.status = v_status)
      and (p_start is null or f.created_at >= p_start)
      and (p_end is null or f.created_at <= p_end)
    order by f.created_at desc
    limit 200
  ) t;
  return result;
end;
$$;

revoke all on function public.admin_list_feedback(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_list_feedback(text, timestamptz, timestamptz) to authenticated;

create or replace function public.admin_issue_intent_trial(p_intent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intent record;
  v_days integer := 14;
  v_has_grant boolean := false;
  v_grant uuid;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  select i.id, i.email, i.user_id
    into v_intent
  from public.purchase_intents i
  where i.id = p_intent_id;
  if v_intent.id is null then
    raise exception 'intent not found';
  end if;
  if v_intent.user_id is null then
    raise exception '该意向没有绑定注册账号，无法发放试用';
  end if;
  if to_regprocedure('public.get_platform_config_int(text, integer)') is not null then
    v_days := public.get_platform_config_int('trial_days', 14);
  end if;
  v_days := greatest(1, least(coalesce(v_days, 14), 365));
  select exists(
    select 1 from public.entitlement_grants g
    where g.user_id = v_intent.user_id
      and g.starts_at <= now()
      and (g.ends_at is null or g.ends_at > now())
  ) into v_has_grant;
  if not v_has_grant then
    v_grant := public.admin_grant_entitlement(v_intent.user_id, 'pro_trial', v_days, '购买意向发放试用');
  end if;
  insert into public.purchase_intent_followups(intent_id, status, trial_granted, updated_at, updated_by)
  values (p_intent_id, 'follow_up', true, now(), auth.uid())
  on conflict (intent_id) do update
    set trial_granted = true,
        updated_at = now(),
        updated_by = auth.uid();
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'intent_trial_grant',
    'admin',
    '/admin/',
    jsonb_build_object(
      'intent_id', p_intent_id,
      'email', v_intent.email,
      'user_id', v_intent.user_id,
      'days', v_days,
      'skipped', v_has_grant,
      'grant_id', v_grant
    )
  );
  return jsonb_build_object(
    'granted', not v_has_grant,
    'skipped', v_has_grant,
    'days', v_days,
    'user_id', v_intent.user_id,
    'email', v_intent.email
  );
end;
$$;

revoke all on function public.admin_issue_intent_trial(uuid) from public, anon;
grant execute on function public.admin_issue_intent_trial(uuid) to authenticated;

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
  v_due_intents integer := 0;
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
  select count(*)::int into v_due_intents
  from public.purchase_intents i
  join public.purchase_intent_followups f on f.intent_id = i.id
  where coalesce(f.status, 'new') <> 'closed'
    and f.next_follow_on is not null
    and f.next_follow_on <= v_today;
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
    'due_intents', coalesce(v_due_intents, 0),
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

create or replace function public.admin_promotion_impact()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_keep integer := 0;
  v_lose integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  select count(*)::int into v_total from auth.users;
  select count(*)::int into v_keep
  from auth.users u
  where exists (
      select 1 from public.entitlement_grants g
      where g.user_id = u.id
        and g.starts_at <= now()
        and (g.ends_at is null or g.ends_at > now())
    )
     or exists (
      select 1 from public.subscriptions s
      where s.user_id = u.id
        and s.status in ('trialing', 'active')
        and (s.current_period_end is null or s.current_period_end > now())
    );
  v_lose := greatest(0, v_total - v_keep);
  select coalesce(jsonb_agg(item order by email), '[]'::jsonb)
    into v_items
  from (
    select jsonb_build_object('user_id', u.id, 'email', u.email) as item, u.email
    from auth.users u
    where not exists (
        select 1 from public.entitlement_grants g
        where g.user_id = u.id
          and g.starts_at <= now()
          and (g.ends_at is null or g.ends_at > now())
      )
      and not exists (
        select 1 from public.subscriptions s
        where s.user_id = u.id
          and s.status in ('trialing', 'active')
          and (s.current_period_end is null or s.current_period_end > now())
      )
    order by u.email
    limit 50
  ) x;
  return jsonb_build_object(
    'registered', v_total,
    'keep_access', v_keep,
    'lose_access', v_lose,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_promotion_impact() from public, anon;
grant execute on function public.admin_promotion_impact() to authenticated;

create or replace function public.admin_unlock_login(p_subject_type text, p_subject_key text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_key text;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_type := lower(trim(coalesce(p_subject_type, '')));
  v_key := lower(trim(coalesce(p_subject_key, '')));
  if v_type not in ('email', 'ip') or v_key = '' then
    raise exception 'invalid unlock target';
  end if;
  if to_regclass('public.login_attempt_state') is null then
    return 0;
  end if;
  delete from public.login_attempt_state
  where subject_type = v_type and lower(subject_key) = v_key;
  get diagnostics v_count = row_count;
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'unlock_login',
    'admin',
    '/admin/',
    jsonb_build_object('subject_type', v_type, 'subject_key', left(v_key, 80), 'cleared', v_count)
  );
  return v_count;
end;
$$;

revoke all on function public.admin_unlock_login(text, text) from public, anon;
grant execute on function public.admin_unlock_login(text, text) to authenticated;

create or replace function public.admin_list_announcements()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      a.id,
      a.title,
      a.body,
      a.is_active,
      a.starts_at,
      a.ends_at,
      a.created_at,
      a.updated_at,
      coalesce((
        select count(*)::int from public.announcement_dismissals d where d.announcement_id = a.id
      ), 0) as dismiss_count
    from public.announcements a
  ) t;
  return result;
end;
$$;

revoke all on function public.admin_list_announcements() from public, anon;
grant execute on function public.admin_list_announcements() to authenticated;

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
  v_locked jsonb := '[]'::jsonb;
  v_resets jsonb := '[]'::jsonb;
  v_new_count integer := 0;
  v_ip_limit integer := 3;
  v_otp_email_limit integer := 3;
  v_otp_ip_limit integer := 10;
  v_fail_limit integer := 5;
  v_reset_email_limit integer := 3;
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
    v_fail_limit := public.get_platform_config_int('login_failure_max_attempts', 5);
    v_reset_email_limit := public.get_platform_config_int('password_reset_per_email_per_hour', 3);
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
        select o.email_norm, count(*)::int as used, $1::int as limit_value
        from public.otp_send_log o
        where o.created_at >= $2
        group by o.email_norm
      ) x
    $q$ into v_otp_email using v_otp_email_limit, v_since_hour;
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x) order by x.used desc, x.ip_hash), '[]'::jsonb)
      from (
        select o.ip_hash, count(*)::int as used, $1::int as limit_value
        from public.otp_send_log o
        where o.created_at >= $2
        group by o.ip_hash
      ) x
    $q$ into v_otp_ip using v_otp_ip_limit, v_since_hour;
  end if;

  if to_regclass('public.login_attempt_state') is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.locked_until desc), '[]'::jsonb)
      into v_locked
    from (
      select subject_type, subject_key, failure_count, locked_until
      from public.login_attempt_state
      where locked_until is not null and locked_until > now()
      order by locked_until desc
      limit 50
    ) x;
  end if;

  if to_regclass('public.password_reset_log') is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.used desc), '[]'::jsonb)
      into v_resets
    from (
      select email_norm, count(*)::int as used, v_reset_email_limit as limit_value
      from public.password_reset_log
      where created_at >= v_since_hour
      group by email_norm
      order by count(*) desc
      limit 50
    ) x;
  end if;

  return jsonb_build_object(
    'day', to_char(v_today, 'YYYY-MM-DD'),
    'new_users_today', coalesce(v_new_count, 0),
    'new_users', coalesce(v_new_users, '[]'::jsonb),
    'registration_ip_today', coalesce(v_ip_regs, '[]'::jsonb),
    'otp_by_email_last_hour', coalesce(v_otp_email, '[]'::jsonb),
    'otp_by_ip_last_hour', coalesce(v_otp_ip, '[]'::jsonb),
    'login_locked', coalesce(v_locked, '[]'::jsonb),
    'password_reset_last_hour', coalesce(v_resets, '[]'::jsonb),
    'limits', jsonb_build_object(
      'registration_success_per_ip_per_day', v_ip_limit,
      'otp_per_email_per_hour', v_otp_email_limit,
      'otp_per_ip_per_hour', v_otp_ip_limit,
      'login_failure_max_attempts', v_fail_limit,
      'password_reset_per_email_per_hour', v_reset_email_limit
    ),
    'tables_ready', jsonb_build_object(
      'registration_ip_log', to_regclass('public.registration_ip_log') is not null,
      'otp_send_log', to_regclass('public.otp_send_log') is not null,
      'login_attempt_state', to_regclass('public.login_attempt_state') is not null,
      'password_reset_log', to_regclass('public.password_reset_log') is not null
    )
  );
end;
$$;

revoke all on function public.admin_risk_console() from public, anon;
grant execute on function public.admin_risk_console() to authenticated;

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
  v_profile jsonb := null;
  v_intents jsonb := '[]'::jsonb;
  v_feedback jsonb := '[]'::jsonb;
  v_cooldown jsonb := null;
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
    v_sessions := '[]'::jsonb;
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

  if to_regclass('public.profiles') is not null then
    select jsonb_build_object(
      'display_name', p.display_name,
      'company', p.company,
      'title', p.title,
      'city', p.city,
      'bio', p.bio
    ) into v_profile
    from public.profiles p
    where p.id = v_user.id;
  end if;

  if to_regclass('public.purchase_intents') is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      into v_intents
    from (
      select
        i.id,
        i.email,
        i.use_case,
        i.company_size,
        i.created_at,
        coalesce(f.status, 'new') as follow_status,
        f.next_follow_on,
        coalesce(f.trial_granted, false) as trial_granted
      from public.purchase_intents i
      left join public.purchase_intent_followups f on f.intent_id = i.id
      where i.user_id = v_user.id or lower(i.email) = lower(v_user.email)
      order by i.created_at desc
      limit 10
    ) t;
  end if;

  if to_regclass('public.feedback') is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      into v_feedback
    from (
      select id, created_at, name, title, status
      from public.feedback
      where user_id = v_user.id
      order by created_at desc
      limit 10
    ) t;
  end if;

  if to_regclass('public.login_attempt_state') is not null then
    select jsonb_build_object(
      'subject_type', s.subject_type,
      'failure_count', s.failure_count,
      'locked_until', s.locked_until,
      'locked', s.locked_until is not null and s.locked_until > now()
    ) into v_cooldown
    from public.login_attempt_state s
    where s.subject_type = 'email' and lower(s.subject_key) = lower(v_user.email);
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
    'grants', coalesce(v_grants, '[]'::jsonb),
    'profile', v_profile,
    'intents', coalesce(v_intents, '[]'::jsonb),
    'feedback', coalesce(v_feedback, '[]'::jsonb),
    'cooldown', v_cooldown
  );
end;
$$;

revoke all on function public.admin_user_dossier(uuid, text) from public, anon;
grant execute on function public.admin_user_dossier(uuid, text) to authenticated;

commit;

