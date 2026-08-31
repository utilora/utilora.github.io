-- 清空测试期访问统计、操作日志、意向、留言。不删账号、不删折扣配置、不改财务账本。
-- 在 Supabase SQL Editor 整份执行。

begin;

delete from public.user_activity_logs;
delete from public.analytics_events;
delete from public.analytics_daily_visitors;
delete from public.purchase_intent_followups;
delete from public.purchase_intents;
delete from public.entitlement_grants;

do $$
begin
  if to_regclass('public.feedback') is not null then
    delete from public.feedback;
  end if;
  if to_regclass('public.audit_logs') is not null then
    delete from public.audit_logs;
  end if;
end $$;

commit;

select
  (select count(*) from public.analytics_events) as analytics_events,
  (select count(*) from public.analytics_daily_visitors) as daily_visitors,
  (select count(*) from public.user_activity_logs) as activity_logs,
  (select count(*) from public.purchase_intents) as purchase_intents;
