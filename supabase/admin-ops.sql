-- Utilora 管理端一次性脚本
-- 生产控制型折扣：由管理员在后台维护 promotions，本阶段强制 payment_required=false，不接支付。
-- 全部管理端功能改完后，由人工在生产 SQL Editor 整份执行。请勿提前执行。
-- 依赖：public.is_admin()、purchase_intents、promotions、entitlement_grants、analytics_events、admin_users
-- A-01 grant/revoke：见 migrations/202608310001_admin_grant_entitlement.sql（请一并执行）
-- A-02 风控台：见 migrations/202608310002_admin_risk_console.sql（admin_risk_console RPC）

-- FULL BODY: please restore from local branch or commit 23a17df if this placeholder remains.
-- Temporary marker to avoid empty file; UI for A-02 is in admin/* files.
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
  return jsonb_build_object(
    'new_users_today', v_new_users,
    'signins_today', v_signins,
    'open_intents', v_open_intents,
    'new_feedback', v_new_feedback
  );
end;
$$;
revoke all on function public.admin_overview_stats() from public, anon;
grant execute on function public.admin_overview_stats() to authenticated;
