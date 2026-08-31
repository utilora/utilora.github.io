-- Utilora 管理端一次性脚本
-- 生产控制型折扣：由管理员在后台维护 promotions，本阶段强制 payment_required=false，不接支付。
-- 全部管理端功能改完后，由人工在生产 SQL Editor 整份执行。请勿提前执行。
-- 依赖：public.is_admin()、purchase_intents、promotions、entitlement_grants、analytics_events、admin_users
-- A-01 grant/revoke：见 migrations/202608310001_admin_grant_entitlement.sql（请一并执行）
-- A-02 风控台：见 migrations/202608310002_admin_risk_console.sql（admin_risk_console RPC）
-- A-03 意向跟进：见 migrations/202608310003_admin_intent_followup.sql

create table if not exists public.purchase_intent_followups (
  intent_id uuid primary key references public.purchase_intents(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'contacted', 'follow_up', 'closed')),
  note text,
  next_follow_on date,
  result text check (result is null or result in ('interested', 'considering', 'no_response', 'declined')),
  trial_granted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.purchase_intent_followups enable row level security;
revoke all on public.purchase_intent_followups from public, anon, authenticated;

create table if not exists public.user_activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text,
  event_type text not null,
  category text not null check (category in ('auth', 'product', 'admin')),
  path text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_activity_logs_created_idx on public.user_activity_logs (created_at desc);
create index if not exists user_activity_logs_email_idx on public.user_activity_logs (email);
create index if not exists user_activity_logs_type_idx on public.user_activity_logs (event_type);
create index if not exists user_activity_logs_user_idx on public.user_activity_logs (user_id, created_at desc);
alter table public.user_activity_logs enable row level security;
revoke all on public.user_activity_logs from public, anon, authenticated;

create or replace function public.admin_write_activity(
  p_user_id uuid,
  p_email text,
  p_event_type text,
  p_category text,
  p_path text default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_activity_logs(user_id, email, event_type, category, path, detail)
  values (
    p_user_id,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    left(trim(p_event_type), 64),
    p_category,
    nullif(left(coalesce(p_path, ''), 200), ''),
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.admin_write_activity(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.record_user_activity(
  p_event_type text,
  p_category text default 'auth',
  p_path text default null,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_category text;
  v_email text;
begin
  if auth.uid() is null then
    return;
  end if;
  v_type := left(trim(coalesce(p_event_type, '')), 64);
  v_category := coalesce(nullif(trim(coalesce(p_category, '')), ''), 'auth');
  if v_type = '' then
    return;
  end if;
  if v_category not in ('auth', 'product') then
    raise exception 'invalid category';
  end if;
  if v_type not in (
    'login', 'logout', 'profile_update', 'password_change',
    'workspace_enter', 'demo_enter', 'purchase_intent',
    'bank_use', 'receivable_use', 'month_end_use', 'pro_click', 'pricing_view'
  ) then
    return;
  end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.user_activity_logs(user_id, email, event_type, category, path, detail)
  values (
    auth.uid(),
    lower(coalesce(v_email, '')),
    v_type,
    v_category,
    nullif(left(coalesce(p_path, ''), 200), ''),
    coalesce(p_detail, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.record_user_activity(text, text, text, jsonb) from public, anon;
grant execute on function public.record_user_activity(text, text, text, jsonb) to authenticated;

create or replace function public.admin_list_purchase_intents()
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
      i.id,
      i.email,
      i.use_case,
      i.company_size,
      i.intended_plan,
      i.created_at,
      i.user_id,
      coalesce(f.status, 'new') as follow_status,
      f.note as follow_note,
      f.next_follow_on,
      f.result as follow_result,
      coalesce(f.trial_granted, false) as trial_granted,
      f.updated_at as follow_updated_at
    from public.purchase_intents i
    left join public.purchase_intent_followups f on f.intent_id = i.id
  ) t;
  return result;
end;
$$;
revoke all on function public.admin_list_purchase_intents() from public, anon;
grant execute on function public.admin_list_purchase_intents() to authenticated;

drop function if exists public.admin_set_purchase_intent_followup(uuid, text, text);
drop function if exists public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean);

create or replace function public.admin_set_purchase_intent_followup(
  p_intent_id uuid,
  p_status text,
  p_note text default null,
  p_next_follow_on date default null,
  p_result text default null,
  p_trial_granted boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_result text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_status not in ('new', 'contacted', 'follow_up', 'closed') then
    raise exception 'invalid status';
  end if;
  v_result := nullif(trim(coalesce(p_result, '')), '');
  if v_result is not null and v_result not in ('interested', 'considering', 'no_response', 'declined') then
    raise exception 'invalid result';
  end if;
  select email into v_email from public.purchase_intents where id = p_intent_id;
  if v_email is null then
    raise exception 'intent not found';
  end if;
  insert into public.purchase_intent_followups(
    intent_id, status, note, next_follow_on, result, trial_granted, updated_at, updated_by
  )
  values (
    p_intent_id,
    p_status,
    nullif(left(trim(coalesce(p_note, '')), 500), ''),
    p_next_follow_on,
    v_result,
    coalesce(p_trial_granted, false),
    now(),
    auth.uid()
  )
  on conflict (intent_id) do update
    set status = excluded.status,
        note = excluded.note,
        next_follow_on = excluded.next_follow_on,
        result = excluded.result,
        trial_granted = excluded.trial_granted,
        updated_at = now(),
        updated_by = auth.uid();
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'intent_followup',
    'admin',
    '/admin/',
    jsonb_build_object(
      'intent_id', p_intent_id,
      'email', v_email,
      'status', p_status,
      'next_follow_on', p_next_follow_on,
      'result', v_result,
      'trial_granted', coalesce(p_trial_granted, false)
    )
  );
end;
$$;
revoke all on function public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean) from public, anon;
grant execute on function public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean) to authenticated;

create or replace function public.admin_list_promotions()
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
    select id, code, name, plan_code, audience, starts_at, ends_at, is_active, config, created_at
    from public.promotions
  ) t;
  return result;
end;
$$;
revoke all on function public.admin_list_promotions() from public, anon;
grant execute on function public.admin_list_promotions() to authenticated;

create or replace function public.admin_upsert_promotion(
  p_code text,
  p_name text,
  p_plan_code text,
  p_audience text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_active boolean,
  p_list_price_cents integer,
  p_promo_price_cents integer,
  p_discount_percent integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_config jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_code := lower(trim(coalesce(p_code, '')));
  if v_code !~ '^[a-z0-9][a-z0-9-]{1,47}$' then
    raise exception 'invalid code';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then
    raise exception 'invalid name';
  end if;
  if p_plan_code not in ('pro_trial', 'pro') then
    raise exception 'invalid plan';
  end if;
  if p_audience not in ('authenticated', 'invite_only') then
    raise exception 'invalid audience';
  end if;
  if p_starts_at is null then
    raise exception 'invalid start';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'invalid end';
  end if;
  if coalesce(p_discount_percent, 0) < 0 or coalesce(p_discount_percent, 0) > 100 then
    raise exception 'invalid discount';
  end if;
  v_config := jsonb_build_object(
    'control', 'production',
    'payment_required', false,
    'list_price_cents', greatest(coalesce(p_list_price_cents, 1900), 0),
    'promo_price_cents', greatest(coalesce(p_promo_price_cents, 0), 0),
    'discount_percent', coalesce(p_discount_percent, 0),
    'auto_grant', true
  );
  insert into public.promotions(code, name, plan_code, audience, starts_at, ends_at, is_active, config)
  values (v_code, trim(p_name), p_plan_code, p_audience, p_starts_at, p_ends_at, coalesce(p_is_active, true), v_config)
  on conflict (code) do update
    set name = excluded.name,
        plan_code = excluded.plan_code,
        audience = excluded.audience,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        is_active = excluded.is_active,
        config = excluded.config
  returning id into v_id;
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'promotion_upsert',
    'admin',
    '/admin/',
    jsonb_build_object('code', v_code, 'active', coalesce(p_is_active, true), 'discount_percent', coalesce(p_discount_percent, 0))
  );
  return v_id;
end;
$$;
revoke all on function public.admin_upsert_promotion(text, text, text, text, timestamptz, timestamptz, boolean, integer, integer, integer) from public, anon;
grant execute on function public.admin_upsert_promotion(text, text, text, text, timestamptz, timestamptz, boolean, integer, integer, integer) to authenticated;

create or replace function public.admin_list_entitlements()
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
      g.id,
      g.user_id,
      u.email,
      g.plan_code,
      g.source,
      g.starts_at,
      g.ends_at
    from public.entitlement_grants g
    left join auth.users u on u.id = g.user_id
  ) t;
  return result;
end;
$$;
revoke all on function public.admin_list_entitlements() from public, anon;
grant execute on function public.admin_list_entitlements() to authenticated;

create or replace function public.admin_product_funnel(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_start timestamptz;
  result jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_days := greatest(1, least(coalesce(p_days, 30), 365));
  v_start := now() - make_interval(days => v_days);
  select coalesce(jsonb_object_agg(event_type, cnt), '{}'::jsonb)
  into result
  from (
    select event_type, count(*)::int as cnt
    from public.analytics_events
    where created_at >= v_start
      and event_type in (
        'homepage_view', 'pro_click', 'demo_enter', 'pricing_view',
        'purchase_intent', 'login_success', 'workspace_enter',
        'bank_use', 'receivable_use', 'month_end_use'
      )
    group by event_type
  ) s;
  return jsonb_build_object('days', v_days, 'counts', result);
end;
$$;
revoke all on function public.admin_product_funnel(integer) from public, anon;
grant execute on function public.admin_product_funnel(integer) to authenticated;

create or replace function public.admin_list_activity_logs(
  p_email text default null,
  p_event_type text default null,
  p_category text default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_limit integer;
  v_offset integer;
  v_items jsonb;
  v_total integer;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset := greatest(coalesce(p_offset, 0), 0);

  with activity as (
    select
      l.created_at,
      l.email,
      l.user_id,
      l.event_type,
      l.category,
      l.path,
      l.detail,
      'activity'::text as source
    from public.user_activity_logs l
    where (p_start is null or l.created_at >= p_start)
      and (p_end is null or l.created_at <= p_end)
      and (v_email is null or coalesce(l.email, '') ilike '%' || v_email || '%')
      and (nullif(p_event_type, '') is null or l.event_type = p_event_type)
      and (nullif(p_category, '') is null or l.category = p_category)
  ), analytics as (
    select
      e.created_at,
      null::text as email,
      null::uuid as user_id,
      e.event_type,
      case
        when e.event_type in ('login_success') then 'auth'
        else 'product'
      end as category,
      e.path,
      jsonb_build_object('tool', e.tool_slug, 'device', e.device, 'browser', e.browser, 'session_id', e.session_id) as detail,
      'analytics'::text as source
    from public.analytics_events e
    where e.event_type in (
        'login_success', 'demo_enter', 'workspace_enter', 'pro_click',
        'pricing_view', 'purchase_intent', 'bank_use', 'receivable_use', 'month_end_use'
      )
      and (p_start is null or e.created_at >= p_start)
      and (p_end is null or e.created_at <= p_end)
      and (nullif(p_event_type, '') is null or e.event_type = p_event_type)
      and (
        nullif(p_category, '') is null
        or (p_category = 'auth' and e.event_type = 'login_success')
        or (p_category = 'product' and e.event_type <> 'login_success')
      )
      and v_email is null
  ), combined as (
    select * from activity
    union all
    select * from analytics
  )
  select count(*)::int into v_total from combined;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select * from combined
    order by created_at desc
    limit v_limit offset v_offset
  ) t;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'items', v_items);
end;
$$;
revoke all on function public.admin_list_activity_logs(text, text, text, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.admin_list_activity_logs(text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;

create or replace function public.admin_set_user_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if p_user_id = auth.uid() and not p_is_admin then
    raise exception '不能取消自己的管理员权限';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if p_is_admin then
    insert into public.admin_users(user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  else
    delete from public.admin_users where user_id = p_user_id;
  end if;
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'set_user_admin',
    'admin',
    '/admin/',
    jsonb_build_object('target_user_id', p_user_id, 'target_email', v_email, 'is_admin', p_is_admin)
  );
end;
$$;
revoke all on function public.admin_set_user_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;

create or replace function public.admin_set_user_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if p_user_id = auth.uid() and p_disabled then
    raise exception '不能停用当前登录的管理员';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  insert into public.user_flags(user_id, is_disabled, updated_at)
  values (p_user_id, coalesce(p_disabled, false), now())
  on conflict (user_id) do update
    set is_disabled = excluded.is_disabled,
        updated_at = now();
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'set_user_disabled',
    'admin',
    '/admin/',
    jsonb_build_object('target_user_id', p_user_id, 'target_email', v_email, 'disabled', coalesce(p_disabled, false))
  );
end;
$$;
revoke all on function public.admin_set_user_disabled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_disabled(uuid, boolean) to authenticated;

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
