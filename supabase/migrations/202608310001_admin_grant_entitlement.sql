-- A-01 人工开通 / 收回专业版
-- 可单独执行；亦已并入 supabase/admin-ops.sql

-- A-01 人工开通 / 收回专业版
-- 试用天数默认 14（与可配置限额表一致）；单次发放可手填覆盖。

create or replace function public.admin_grant_entitlement(
  p_user_id uuid,
  p_plan_code text,
  p_days integer default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_plan text;
  v_days integer;
  v_ends timestamptz;
  v_id uuid;
  v_source text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  v_plan := lower(trim(coalesce(p_plan_code, '')));
  if v_plan not in ('pro_trial', 'pro') then
    raise exception 'invalid plan';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'user not found';
  end if;

  -- pro_trial 必须带天数；pro 可长期（p_days null）或限期
  if v_plan = 'pro_trial' then
    v_days := coalesce(nullif(p_days, 0), 14);
    if v_days < 1 or v_days > 3650 then
      raise exception 'invalid days';
    end if;
    v_ends := now() + make_interval(days => v_days);
    v_source := 'admin_trial';
  else
    if p_days is null or p_days = 0 then
      v_days := null;
      v_ends := null;
    else
      v_days := p_days;
      if v_days < 1 or v_days > 3650 then
        raise exception 'invalid days';
      end if;
      v_ends := now() + make_interval(days => v_days);
    end if;
    v_source := 'admin_grant';
  end if;

  insert into public.entitlement_grants(user_id, plan_code, source, starts_at, ends_at, metadata)
  values (
    p_user_id,
    v_plan,
    v_source,
    now(),
    v_ends,
    jsonb_build_object(
      'granted_by', auth.uid(),
      'note', nullif(left(trim(coalesce(p_note, '')), 200), ''),
      'days', v_days
    )
  )
  returning id into v_id;

  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'grant_entitlement',
    'admin',
    '/admin/',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'target_email', v_email,
      'plan_code', v_plan,
      'days', v_days,
      'ends_at', v_ends,
      'grant_id', v_id
    )
  );
  return v_id;
end;
$$;
revoke all on function public.admin_grant_entitlement(uuid, text, integer, text) from public, anon;
grant execute on function public.admin_grant_entitlement(uuid, text, integer, text) to authenticated;

create or replace function public.admin_revoke_entitlements(
  p_user_id uuid,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_count integer;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'user not found';
  end if;

  update public.entitlement_grants
  set ends_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'revoked_by', auth.uid(),
        'revoked_at', now(),
        'revoke_note', nullif(left(trim(coalesce(p_note, '')), 200), '')
      )
  where user_id = p_user_id
    and starts_at <= now()
    and (ends_at is null or ends_at > now());

  get diagnostics v_count = row_count;

  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'revoke_entitlement',
    'admin',
    '/admin/',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'target_email', v_email,
      'revoked_count', v_count,
      'note', nullif(left(trim(coalesce(p_note, '')), 200), '')
    )
  );
  return v_count;
end;
$$;
revoke all on function public.admin_revoke_entitlements(uuid, text) from public, anon;
grant execute on function public.admin_revoke_entitlements(uuid, text) to authenticated;
