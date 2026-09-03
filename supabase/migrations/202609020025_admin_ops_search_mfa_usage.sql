-- A-16 意向认领、关键字检索配套、未验证名单、管理员未开二次验证、Edge 日调用
begin;

alter table public.purchase_intent_followups
  add column if not exists handler_id uuid references auth.users(id) on delete set null,
  add column if not exists handler_email text,
  add column if not exists handled_at timestamptz;

drop function if exists public.admin_set_purchase_intent_followup(uuid, text, text);
drop function if exists public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean);

create or replace function public.admin_set_purchase_intent_followup(
  p_intent_id uuid,
  p_status text,
  p_note text default null,
  p_next_follow_on date default null,
  p_result text default null,
  p_trial_granted boolean default false,
  p_claim boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_result text;
  v_actor text;
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
  select email into v_actor from auth.users where id = auth.uid();
  insert into public.purchase_intent_followups(
    intent_id, status, note, next_follow_on, result, trial_granted,
    handler_id, handler_email, handled_at, updated_at, updated_by
  )
  values (
    p_intent_id,
    p_status,
    nullif(left(trim(coalesce(p_note, '')), 500), ''),
    p_next_follow_on,
    v_result,
    coalesce(p_trial_granted, false),
    case when coalesce(p_claim, false) then auth.uid() else null end,
    case when coalesce(p_claim, false) then v_actor else null end,
    case when coalesce(p_claim, false) then now() else null end,
    now(),
    auth.uid()
  )
  on conflict (intent_id) do update
    set status = excluded.status,
        note = excluded.note,
        next_follow_on = excluded.next_follow_on,
        result = excluded.result,
        trial_granted = excluded.trial_granted,
        handler_id = case when coalesce(p_claim, false) then auth.uid() else public.purchase_intent_followups.handler_id end,
        handler_email = case when coalesce(p_claim, false) then v_actor else public.purchase_intent_followups.handler_email end,
        handled_at = case
          when coalesce(p_claim, false) then now()
          else public.purchase_intent_followups.handled_at
        end,
        updated_at = now(),
        updated_by = auth.uid();
  perform public.admin_write_activity(
    auth.uid(),
    v_actor,
    'intent_followup',
    'admin',
    '/admin/',
    jsonb_build_object(
      'intent_id', p_intent_id,
      'email', v_email,
      'status', p_status,
      'next_follow_on', p_next_follow_on,
      'result', v_result,
      'trial_granted', coalesce(p_trial_granted, false),
      'claimed', coalesce(p_claim, false)
    )
  );
end;
$$;

revoke all on function public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean, boolean) from public, anon;
grant execute on function public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean, boolean) to authenticated;

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
      f.updated_at as follow_updated_at,
      f.handler_id,
      f.handler_email,
      f.handled_at
    from public.purchase_intents i
    left join public.purchase_intent_followups f on f.intent_id = i.id
  ) t;
  return result;
end;
$$;

revoke all on function public.admin_list_purchase_intents() from public, anon;
grant execute on function public.admin_list_purchase_intents() to authenticated;

create or replace function public.admin_list_unverified_users()
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
      u.id,
      u.email,
      coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(coalesce(u.email, ''), '@', 1)) as name,
      u.created_at,
      u.last_sign_in_at,
      exists (select 1 from public.admin_users a where a.user_id = u.id) as is_admin,
      coalesce(f.is_disabled, false) as is_disabled
    from auth.users u
    left join public.user_flags f on f.user_id = u.id
    where u.email_confirmed_at is null
    order by u.created_at desc
    limit 200
  ) t;
  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_unverified_users() from public, anon;
grant execute on function public.admin_list_unverified_users() to authenticated;

create or replace function public.admin_list_admins_mfa()
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
  begin
    select coalesce(jsonb_agg(to_jsonb(t) order by t.mfa_enabled, t.email), '[]'::jsonb)
      into result
    from (
      select
        a.user_id,
        u.email,
        coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(coalesce(u.email, ''), '@', 1)) as name,
        exists(
          select 1 from auth.mfa_factors f
          where f.user_id = a.user_id and f.status = 'verified'
        ) as mfa_enabled,
        coalesce(fl.is_disabled, false) as is_disabled
      from public.admin_users a
      join auth.users u on u.id = a.user_id
      left join public.user_flags fl on fl.user_id = a.user_id
    ) t;
  exception when others then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.email), '[]'::jsonb)
      into result
    from (
      select
        a.user_id,
        u.email,
        coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(coalesce(u.email, ''), '@', 1)) as name,
        false as mfa_enabled,
        coalesce(fl.is_disabled, false) as is_disabled
      from public.admin_users a
      join auth.users u on u.id = a.user_id
      left join public.user_flags fl on fl.user_id = a.user_id
    ) t;
  end;
  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_admins_mfa() from public, anon;
grant execute on function public.admin_list_admins_mfa() to authenticated;

create or replace function public.admin_list_edge_function_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date;
  v_limit integer := 10000;
  v_items jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  v_day := (now() at time zone 'Asia/Shanghai')::date;
  if to_regprocedure('public.get_platform_config_int(text, integer)') is not null then
    v_limit := public.get_platform_config_int('edge_function_daily_call_limit', 10000);
  end if;
  v_limit := greatest(1, coalesce(v_limit, 10000));
  if to_regclass('public.edge_function_call_log') is not null then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.used desc, t.function_name), '[]'::jsonb)
      into v_items
    from (
      select
        l.function_name,
        l.call_count as used,
        greatest(v_limit - l.call_count, 0) as remaining,
        l.call_count >= v_limit as over_limit
      from public.edge_function_call_log l
      where l.call_day = v_day
    ) t;
  end if;
  return jsonb_build_object(
    'day', to_char(v_day, 'YYYY-MM-DD'),
    'limit', v_limit,
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_list_edge_function_usage() from public, anon;
grant execute on function public.admin_list_edge_function_usage() to authenticated;

commit;
