-- S-09 留言与购买意向提交限流
-- 默认：每用户每小时留言 5；每 IP 每小时留言 10；
--       每邮箱每小时购买意向 3；每 IP 每小时购买意向 10。

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
  ('feedback_per_user_per_hour', '5'::jsonb),
  ('feedback_per_ip_per_hour', '10'::jsonb),
  ('purchase_intent_per_email_per_hour', '3'::jsonb),
  ('purchase_intent_per_ip_per_hour', '10'::jsonb)
on conflict (key) do nothing;

create table if not exists public.public_submit_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('feedback', 'purchase_intent')),
  subject_norm text not null,
  ip_hash text not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists public_submit_log_kind_subject_idx
  on public.public_submit_log (kind, subject_norm, created_at desc);

create index if not exists public_submit_log_kind_ip_idx
  on public.public_submit_log (kind, ip_hash, created_at desc);

alter table public.public_submit_log enable row level security;
revoke all on public.public_submit_log from public, anon, authenticated;

create or replace function public.get_platform_config_int(p_key text, p_default integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
  n integer;
begin
  select value into v from public.platform_config where key = p_key;
  if v is null then
    return greatest(coalesce(p_default, 0), 0);
  end if;
  begin
    n := (v #>> '{}')::integer;
  exception when others then
    n := null;
  end;
  if n is null then
    begin
      n := (v)::text::integer;
    exception when others then
      n := p_default;
    end;
  end if;
  return greatest(coalesce(n, p_default, 0), 0);
end;
$$;

revoke all on function public.get_platform_config_int(text, integer) from public, anon, authenticated;

create or replace function public.check_public_submit_allowed(p_kind text, p_subject text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_subject text;
  v_hash text;
  v_subject_key text;
  v_ip_key text;
  v_subject_default integer;
  v_ip_default integer;
  v_subject_limit integer;
  v_ip_limit integer;
  v_subject_used integer;
  v_ip_used integer;
  v_since timestamptz;
begin
  v_kind := lower(nullif(trim(coalesce(p_kind, '')), ''));
  if v_kind not in ('feedback', 'purchase_intent') then
    raise exception 'invalid kind';
  end if;
  v_subject := lower(nullif(trim(coalesce(p_subject, '')), ''));
  if v_subject is null or length(v_subject) < 2 or length(v_subject) > 320 then
    raise exception 'invalid subject';
  end if;
  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  if v_hash is null or length(v_hash) < 8 or length(v_hash) > 128 then
    raise exception 'invalid ip hash';
  end if;
  if v_kind = 'feedback' then
    v_subject_key := 'feedback_per_user_per_hour';
    v_ip_key := 'feedback_per_ip_per_hour';
    v_subject_default := 5;
    v_ip_default := 10;
  else
    v_subject_key := 'purchase_intent_per_email_per_hour';
    v_ip_key := 'purchase_intent_per_ip_per_hour';
    v_subject_default := 3;
    v_ip_default := 10;
  end if;
  v_since := now() - interval '1 hour';
  v_subject_limit := public.get_platform_config_int(v_subject_key, v_subject_default);
  v_ip_limit := public.get_platform_config_int(v_ip_key, v_ip_default);
  select count(*)::integer into v_subject_used
  from public.public_submit_log
  where kind = v_kind and subject_norm = v_subject and created_at >= v_since;
  select count(*)::integer into v_ip_used
  from public.public_submit_log
  where kind = v_kind and ip_hash = v_hash and created_at >= v_since;
  return jsonb_build_object(
    'allowed', (v_subject_used < v_subject_limit and v_ip_used < v_ip_limit),
    'kind', v_kind,
    'subject_limit', v_subject_limit,
    'subject_used', v_subject_used,
    'subject_remaining', greatest(v_subject_limit - v_subject_used, 0),
    'ip_limit', v_ip_limit,
    'ip_used', v_ip_used,
    'ip_remaining', greatest(v_ip_limit - v_ip_used, 0),
    'reason', case
      when v_subject_used >= v_subject_limit then 'subject_limit'
      when v_ip_used >= v_ip_limit then 'ip_limit'
      else null
    end
  );
end;
$$;

revoke all on function public.check_public_submit_allowed(text, text, text) from public, anon, authenticated;

create or replace function public.record_public_submit(p_kind text, p_subject text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check jsonb;
  v_kind text;
  v_subject text;
  v_hash text;
  v_allowed boolean;
  v_action text;
begin
  v_check := public.check_public_submit_allowed(p_kind, p_subject, p_ip_hash);
  v_allowed := coalesce((v_check ->> 'allowed')::boolean, false);
  v_kind := lower(nullif(trim(coalesce(p_kind, '')), ''));
  v_subject := lower(nullif(trim(coalesce(p_subject, '')), ''));
  v_hash := nullif(trim(coalesce(p_ip_hash, '')), '');
  insert into public.public_submit_log(kind, subject_norm, ip_hash, allowed)
  values (v_kind, v_subject, v_hash, v_allowed);
  v_action := case
    when v_allowed and v_kind = 'feedback' then 'feedback_submit'
    when v_allowed then 'purchase_intent_submit'
    when v_kind = 'feedback' then 'feedback_submit_blocked'
    else 'purchase_intent_submit_blocked'
  end;
  if to_regprocedure('public.admin_write_activity(uuid, text, text, text, text, jsonb)') is not null then
    perform public.admin_write_activity(
      null,
      v_subject,
      v_action,
      'security',
      case when v_kind = 'feedback' then '/feedback/' else '/pro/' end,
      jsonb_build_object('kind', v_kind, 'allowed', v_allowed, 'reason', v_check ->> 'reason')
    );
  end if;
  if not v_allowed then
    raise exception 'public_submit_limit_exceeded'
      using errcode = 'P0001',
            detail = coalesce(v_check ->> 'reason', 'limit');
  end if;
  return jsonb_build_object(
    'recorded', true,
    'kind', v_kind,
    'subject_limit', (v_check ->> 'subject_limit')::integer,
    'subject_used', (v_check ->> 'subject_used')::integer + 1,
    'subject_remaining', greatest((v_check ->> 'subject_remaining')::integer - 1, 0),
    'ip_limit', (v_check ->> 'ip_limit')::integer,
    'ip_used', (v_check ->> 'ip_used')::integer + 1,
    'ip_remaining', greatest((v_check ->> 'ip_remaining')::integer - 1, 0)
  );
end;
$$;

revoke all on function public.record_public_submit(text, text, text) from public, anon, authenticated;

do $$
begin
  if to_regclass('public.feedback') is null then
    return;
  end if;
  revoke insert on table public.feedback from public, anon, authenticated;
  drop policy if exists feedback_authenticated_insert on public.feedback;
end;
$$;

commit;
