-- Utilora 管理端一次性脚本
-- 生产控制型折扣：由管理员在后台维护 promotions，本阶段强制 payment_required=false，不接支付。
-- 全部管理端功能改完后，由人工在生产 SQL Editor 整份执行。请勿提前执行。
-- 依赖：public.is_admin()、purchase_intents、promotions、entitlement_grants、analytics_events、admin_users
-- A-01 grant/revoke：见 migrations/202608310001_admin_grant_entitlement.sql（请一并执行）
-- A-02 风控台：见 migrations/202608310002_admin_risk_console.sql（admin_risk_console RPC）

create table if not exists public.purchase_intent_followups (
  intent_id uuid primary key references public.purchase_intents(id) on delete cascade,
  status text not null default 'new' check (status in ('new', 'contacted', 'follow_up', 'closed')),
  note text,
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
