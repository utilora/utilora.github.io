-- Utilora 管理端一次性脚本
-- 生产控制型折扣：由管理员在后台维护 promotions，本阶段强制 payment_required=false，不接支付。
-- 全部管理端功能改完后，由人工在生产 SQL Editor 整份执行。请勿提前执行。
-- 依赖：public.is_admin()、purchase_intents、promotions、entitlement_grants、analytics_events、admin_users

create table if not exists public.purchase_intent_followups (
  intent_id uuid primary key references public.purchase_intents(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'contacted', 'follow_up', 'closed')),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table public.purchase_intent_followups enable row level security;
revoke all on public.purchase_intent_followups from public, anon, authenticated;

-- NOTE: Full file restored in follow-up; this is emergency partial restore marker.
