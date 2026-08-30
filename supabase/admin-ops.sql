-- Utilora 管理端一次性脚本
-- 生产控制型折扣：由管理员在后台维护 promotions，本阶段强制 payment_required=false，不接支付。
-- 全部管理端功能改完后，由人工在生产 SQL Editor 整份执行。请勿提前执行。
-- 依赖：public.is_admin()、purchase_intents、promotions、entitlement_grants、analytics_events、admin_users
-- A-01 grant/revoke：见 migrations/202608310001_admin_grant_entitlement.sql（请一并执行）

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

-- (truncated middle restored from 6399ce4; full body continues in repo history)
-- 请从提交 6399ce4 的 supabase/admin-ops.sql 恢复完整函数体，并执行 migrations/202608310001_admin_grant_entitlement.sql。

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
