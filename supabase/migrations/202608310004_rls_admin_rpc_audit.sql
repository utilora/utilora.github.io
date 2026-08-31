-- S-05: 审计 RLS 与 admin RPC
-- 目标：anon key 不能通过表 API 或 RPC 拉取用户表、分析表、管理数据；admin RPC 仅 authenticated + is_admin。
-- 本迁移幂等：可重复执行。

begin;

-- ---------------------------------------------------------------------------
-- 1) 敏感表：开启 RLS，撤销 anon/authenticated 直接表权限
--    （业务读写一律走带 is_admin / auth.uid 校验的 SECURITY DEFINER RPC 或既有策略）
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  sensitive text[] := array[
    'admin_users',
    'user_flags',
    'user_activity_logs',
    'analytics_events',
    'analytics_daily_visitors',
    'purchase_intents',
    'purchase_intent_followups',
    'platform_config',
    'registration_ip_log',
    'otp_send_log',
    'login_attempt_state',
    'audit_logs',
    'entitlement_grants',
    'subscriptions',
    'profiles'
  ];
begin
  foreach t in array sensitive
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from public, anon, authenticated', t);
    end if;
  end loop;
end;
$$;

-- feedback：若存在则同样收紧；anon 仅可通过专用提交路径写入（若有则保留 insert 策略由既有脚本定义）
do $$
begin
  if to_regclass('public.feedback') is not null then
    alter table public.feedback enable row level security;
    revoke all on table public.feedback from public, anon;
    -- authenticated 的 select/update/delete 由 is_admin 策略控制；不授予 anon 任何权限
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) 恢复「本人可读」类策略所需的最小 grant（仅 authenticated，且仍受 RLS 约束）
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is not null then
    grant select, update on table public.profiles to authenticated;
  end if;
  if to_regclass('public.subscriptions') is not null then
    grant select on table public.subscriptions to authenticated;
  end if;
  if to_regclass('public.entitlement_grants') is not null then
    grant select on table public.entitlement_grants to authenticated;
  end if;
  if to_regclass('public.audit_logs') is not null then
    grant select on table public.audit_logs to authenticated;
  end if;
  if to_regclass('public.feedback') is not null then
    grant select, update, delete on table public.feedback to authenticated;
  end if;
end;
$$;

-- profiles / subscriptions / grants / audit 已有 RLS 策略（self 或 org admin）；此处确保无面向 anon 的策略
do $$
begin
  if to_regclass('public.profiles') is not null then
    drop policy if exists profiles_anon_all on public.profiles;
    drop policy if exists "Allow anon read profiles" on public.profiles;
  end if;
  if to_regclass('public.analytics_events') is not null then
    drop policy if exists analytics_events_anon_select on public.analytics_events;
    drop policy if exists analytics_events_public_read on public.analytics_events;
  end if;
  if to_regclass('public.analytics_daily_visitors') is not null then
    drop policy if exists analytics_daily_visitors_anon_select on public.analytics_daily_visitors;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Admin / 内部 RPC：禁止 anon 与 public 执行；仅 authenticated（函数内 is_admin 再拦）
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
  admin_fns text[] := array[
    'is_admin()',
    'admin_list_users()',
    'admin_set_user_admin(uuid,boolean)',
    'admin_set_user_disabled(uuid,boolean)',
    'admin_list_purchase_intents()',
    'admin_set_purchase_intent_followup(uuid,text,text)',
    'admin_list_promotions()',
    'admin_upsert_promotion(text,text,text,text,timestamptz,timestamptz,boolean,integer,integer,integer)',
    'admin_list_entitlements()',
    'admin_product_funnel(integer)',
    'admin_list_activity_logs(text,text,text,timestamptz,timestamptz,integer,integer)',
    'admin_overview_stats()',
    'admin_write_activity(uuid,text,text,text,text,jsonb)',
    'get_analytics_summary(integer,date,date)',
    'get_platform_config_int(text,integer)',
    'check_registration_ip_allowed(text)',
    'record_registration_ip(text,uuid)',
    'check_otp_send_allowed(text,text)',
    'record_otp_send(text,text)',
    'check_login_allowed(text,text)',
    'record_login_failure(text,text)',
    'clear_login_failures(text,text)',
    'account_is_disabled()'
  ];
  sig text;
begin
  foreach sig in array admin_fns
  loop
    begin
      execute format('revoke all on function public.%s from public, anon', sig);
      -- 管理端与账户检查需要 authenticated 可调用；内部限流函数保持无 grant（仅 service_role）
      if sig in (
        'get_platform_config_int(text,integer)',
        'check_registration_ip_allowed(text)',
        'record_registration_ip(text,uuid)',
        'check_otp_send_allowed(text,text)',
        'record_otp_send(text,text)',
        'check_login_allowed(text,text)',
        'record_login_failure(text,text)',
        'clear_login_failures(text,text)',
        'admin_write_activity(uuid,text,text,text,text,jsonb)'
      ) then
        execute format('revoke all on function public.%s from authenticated', sig);
      else
        execute format('grant execute on function public.%s to authenticated', sig);
      end if;
    exception
      when undefined_function then
        null;
    end;
  end loop;
end;
$$;

-- 允许匿名埋点与购买意向提交的函数保持对 anon 开放（不返回敏感列表）
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'track_analytics_event'
  ) then
    revoke all on function public.track_analytics_event(text, text, text, text, text, text, text) from public;
    grant execute on function public.track_analytics_event(text, text, text, text, text, text, text) to anon, authenticated;
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_purchase_intent'
  ) then
    revoke all on function public.submit_purchase_intent(text, text, text, text) from public;
    grant execute on function public.submit_purchase_intent(text, text, text, text) to anon, authenticated;
  end if;
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_user_activity'
  ) then
    revoke all on function public.record_user_activity(text, text, text, jsonb) from public, anon;
    grant execute on function public.record_user_activity(text, text, text, jsonb) to authenticated;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) 强化 is_admin：仅 authenticated 可执行；search_path 固定
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) 文档化：默认 plans 仍可对 anon 只读（公开价目，非用户/分析数据）
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.plans') is not null then
    grant select on table public.plans to anon, authenticated;
  end if;
end;
$$;

commit;
