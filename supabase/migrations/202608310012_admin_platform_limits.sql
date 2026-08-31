-- A-07 限额配置页：管理端可改 platform_config 全部数量类限额
-- 保存后立即生效；非法值拒绝；写 admin 审计。
-- 试用天数供 A-01 发放试用缺省读取。

begin;

create table if not exists public.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_config enable row level security;
revoke all on public.platform_config from public, anon, authenticated;

insert into public.platform_config(key, value)
values
  ('registration_success_per_ip_per_day', '3'::jsonb),
  ('otp_per_email_per_hour', '3'::jsonb),
  ('otp_per_ip_per_hour', '10'::jsonb),
  ('login_failure_max_attempts', '5'::jsonb),
  ('login_cooldown_minutes', '15'::jsonb),
  ('password_reset_per_email_per_hour', '3'::jsonb),
  ('password_reset_per_ip_per_hour', '10'::jsonb),
  ('trial_days', '14'::jsonb),
  ('invite_reward_months', '3'::jsonb),
  ('edge_function_daily_call_limit', '10000'::jsonb),
  ('match_date_near_days', '3'::jsonb),
  ('match_amount_tolerance_cents', '0'::jsonb),
  ('backup_stale_days', '7'::jsonb),
  ('aging_bucket_1_days', '30'::jsonb),
  ('aging_bucket_2_days', '60'::jsonb),
  ('aging_bucket_3_days', '90'::jsonb)
on conflict (key) do nothing;
