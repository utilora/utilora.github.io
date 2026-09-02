-- 档案停用/提权、最后管理员保护、留言备注与处理人、
-- 邮箱回填账号、今日新地点登录、邀请表预埋（不入账、不对用户展示）
begin;

insert into public.platform_config(key, value)
values ('invite_ui_enabled', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.bind_accounts_for_user(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if p_user_id is null then
    return;
  end if;
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return;
  end if;
  if to_regclass('public.purchase_intents') is not null then
    update public.purchase_intents i
      set user_id = p_user_id
    where i.user_id is null
      and lower(i.email) = v_email
      and not exists (
        select 1 from public.purchase_intents x where x.user_id = p_user_id
      );
  end if;
  if to_regclass('public.feedback') is not null then
    update public.feedback f
      set user_id = p_user_id
    where f.user_id is null
      and lower(trim(coalesce(f.contact, ''))) = v_email;
  end if;
end;
$$;

revoke all on function public.bind_accounts_for_user(uuid, text) from public, anon, authenticated;

create or replace function public.bind_accounts_by_email()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare rec record;
begin
  for rec in
    select id, email from auth.users where email is not null
  loop
    perform public.bind_accounts_for_user(rec.id, rec.email);
  end loop;
end;
$$;

revoke all on function public.bind_accounts_by_email() from public, anon, authenticated;

create or replace function public.bind_accounts_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.bind_accounts_for_user(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists bind_accounts_on_auth_user on auth.users;
create trigger bind_accounts_on_auth_user
  after insert or update of email on auth.users
  for each row
  execute function public.bind_accounts_on_auth_user();

select public.bind_accounts_by_email();

alter table public.feedback
  add column if not exists admin_note text,
  add column if not exists handler_id uuid references auth.users(id) on delete set null,
  add column if not exists handler_email text,
  add column if not exists handled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_admin_note_len' and conrelid = 'public.feedback'::regclass
  ) then
    alter table public.feedback
      add constraint feedback_admin_note_len check (admin_note is null or char_length(admin_note) <= 500);
  end if;
end;
$$;

create or replace function public.admin_set_user_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_admins integer;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if not p_is_admin then
    select count(*)::int into v_admins from public.admin_users;
    if coalesce(v_admins, 0) <= 1 then
      raise exception '不能取消最后一位管理员';
    end if;
    if p_user_id = auth.uid() then
      raise exception '不能取消自己的管理员权限';
    end if;
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'user not found';
  end if;
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
declare
  v_email text;
  v_enabled integer;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if coalesce(p_disabled, false) then
    if p_user_id = auth.uid() then
      raise exception '不能停用当前登录的管理员';
    end if;
    if exists (select 1 from public.admin_users where user_id = p_user_id) then
      select count(*)::int into v_enabled
      from public.admin_users a
      left join public.user_flags f on f.user_id = a.user_id
      where a.user_id is distinct from p_user_id
        and coalesce(f.is_disabled, false) = false;
      if coalesce(v_enabled, 0) < 1 then
        raise exception '不能停用最后一位可用的管理员';
      end if;
    end if;
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'user not found';
  end if;
  insert into public.user_flags(user_id, is_disabled, updated_at)
  values (p_user_id, coalesce(p_disabled, false), now())
  on conflict (user_id) do update
    set is_disabled = excluded.is_disabled,
        updated_at = now();
  if coalesce(p_disabled, false) and to_regprocedure('public.revoke_user_sessions(uuid)') is not null then
    perform public.revoke_user_sessions(p_user_id);
  end if;
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
  perform public.bind_accounts_by_email();
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
      u.email as user_email,
      f.admin_note,
      f.handler_id,
      f.handler_email,
      f.handled_at
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

create or replace function public.admin_set_feedback_followup(
  p_id bigint,
  p_status text default null,
  p_note text default null,
  p_claim boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_note text;
  v_email text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is not null and v_status not in ('new', 'processing', 'completed', 'closed') then
    raise exception 'invalid status';
  end if;
  v_note := nullif(left(trim(coalesce(p_note, '')), 500), '');
  select email into v_email from auth.users where id = auth.uid();
  update public.feedback
    set status = coalesce(v_status, status),
        admin_note = case when p_note is null then admin_note else v_note end,
        handler_id = case when coalesce(p_claim, false) then auth.uid() else handler_id end,
        handler_email = case when coalesce(p_claim, false) then v_email else handler_email end,
        handled_at = case
          when coalesce(p_claim, false) or v_status is not null or p_note is not null then now()
          else handled_at
        end
  where id = p_id;
  if not found then
    raise exception 'feedback not found';
  end if;
  perform public.admin_write_activity(
    auth.uid(),
    v_email,
    'feedback_followup',
    'admin',
    '/admin/',
    jsonb_build_object('id', p_id, 'status', v_status, 'claimed', coalesce(p_claim, false))
  );
end;
$$;

revoke all on function public.admin_set_feedback_followup(bigint, text, text, boolean) from public, anon;
grant execute on function public.admin_set_feedback_followup(bigint, text, text, boolean) to authenticated;

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
  perform public.bind_accounts_by_email();
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
  perform public.bind_accounts_by_email();
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

create or replace function public.admin_list_new_login_locations()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  result jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_today := (now() at time zone 'Asia/Shanghai')::date;
  if to_regclass('public.login_locations') is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.first_seen desc), '[]'::jsonb)
    into result
  from (
    select
      l.user_id,
      u.email,
      left(l.ip_hash, 8) as network,
      l.first_seen,
      l.last_seen
    from public.login_locations l
    left join auth.users u on u.id = l.user_id
    where (l.first_seen at time zone 'Asia/Shanghai')::date = v_today
    order by l.first_seen desc
    limit 50
  ) t;
  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_new_login_locations() from public, anon;
grant execute on function public.admin_list_new_login_locations() to authenticated;

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid references auth.users(id) on delete set null,
  invitee_email text,
  status text not null default 'bound'
    check (status in ('bound', 'pending_payment', 'credited', 'invalid')),
  created_at timestamptz not null default now(),
  bound_at timestamptz,
  credited_at timestamptz,
  constraint invites_code_len check (char_length(code) between 6 and 32),
  constraint invites_no_self check (invitee_id is distinct from inviter_id)
);

create unique index if not exists invites_one_live_invitee
  on public.invites (invitee_id)
  where invitee_id is not null and status in ('bound', 'pending_payment', 'credited');

create index if not exists invites_inviter_idx on public.invites (inviter_id, created_at desc);

alter table public.invites enable row level security;
revoke all on public.invites from public, anon, authenticated;

create or replace function public.admin_list_invites()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb := '[]'::jsonb;
  v_ui boolean := false;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  begin
    select coalesce((value #>> '{}')::boolean, false)
      into v_ui
    from public.platform_config
    where key = 'invite_ui_enabled';
  exception when others then
    v_ui := false;
  end;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      i.id,
      i.code,
      i.status,
      i.created_at,
      i.bound_at,
      i.credited_at,
      i.invitee_email,
      inviter.email as inviter_email,
      invitee.email as invitee_user_email
    from public.invites i
    left join auth.users inviter on inviter.id = i.inviter_id
    left join auth.users invitee on invitee.id = i.invitee_id
    order by i.created_at desc
    limit 200
  ) t;
  return jsonb_build_object(
    'items', coalesce(result, '[]'::jsonb),
    'invite_ui_enabled', coalesce(v_ui, false),
    'payment_connected', false
  );
end;
$$;

revoke all on function public.admin_list_invites() from public, anon;
grant execute on function public.admin_list_invites() to authenticated;

create or replace function public.bind_invite_code(p_code text, p_invitee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'invite_ui_disabled';
end;
$$;

revoke all on function public.bind_invite_code(text, uuid) from public, anon, authenticated;
grant execute on function public.bind_invite_code(text, uuid) to service_role;

create or replace function public.apply_invite_credit(p_invitee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'payment_not_connected';
end;
$$;

revoke all on function public.apply_invite_credit(uuid) from public, anon, authenticated;
grant execute on function public.apply_invite_credit(uuid) to service_role;

commit;
