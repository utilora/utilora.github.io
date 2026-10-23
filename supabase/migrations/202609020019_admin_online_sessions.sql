-- 管理端查看在线会话，并强制下线（删除 auth.sessions，refresh 立即失效）。

create or replace function public.admin_list_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_current uuid;
  result jsonb;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;

  begin
    v_current := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_current := null;
  end;

  begin
    select coalesce(jsonb_agg(item order by last_active desc), '[]'::jsonb)
      into result
    from (
      select jsonb_build_object(
        'session_id', s.id,
        'user_id', s.user_id,
        'email', u.email,
        'created_at', s.created_at,
        'last_active', coalesce(s.updated_at, s.created_at),
        'user_agent', left(coalesce(s.user_agent, ''), 180),
        'online', coalesce(s.updated_at, s.created_at) > now() - interval '30 minutes',
        'is_admin', exists (select 1 from public.admin_users a where a.user_id = s.user_id),
        'is_self', s.user_id = auth.uid(),
        'is_current', v_current is not null and s.id = v_current
      ) as item,
      coalesce(s.updated_at, s.created_at) as last_active
      from auth.sessions s
      left join auth.users u on u.id = s.user_id
      where (s.not_after is null or s.not_after > now())
      order by last_active desc
      limit 500
    ) q;
    return jsonb_build_object('items', coalesce(result, '[]'::jsonb));
  exception when others then
    select coalesce(jsonb_agg(item order by last_active desc), '[]'::jsonb)
      into result
    from (
      select jsonb_build_object(
        'session_id', s.id,
        'user_id', s.user_id,
        'email', u.email,
        'created_at', s.created_at,
        'last_active', coalesce(s.updated_at, s.created_at),
        'user_agent', '',
        'online', coalesce(s.updated_at, s.created_at) > now() - interval '30 minutes',
        'is_admin', exists (select 1 from public.admin_users a where a.user_id = s.user_id),
        'is_self', s.user_id = auth.uid(),
        'is_current', v_current is not null and s.id = v_current
      ) as item,
      coalesce(s.updated_at, s.created_at) as last_active
      from auth.sessions s
      left join auth.users u on u.id = s.user_id
      order by last_active desc
      limit 500
    ) q;
    return jsonb_build_object('items', coalesce(result, '[]'::jsonb));
  end;
end;
$$;

revoke all on function public.admin_list_sessions() from public, anon;
grant execute on function public.admin_list_sessions() to authenticated;

create or replace function public.admin_force_logout(p_user_id uuid, p_session_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
  v_email text;
  v_target text;
  v_count integer := 0;
  v_scope text;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;

  begin
    v_current := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_current := null;
  end;

  if p_session_id is not null and v_current is not null and p_session_id = v_current then
    raise exception '不能下线当前这一处后台会话';
  end if;

  select email into v_target from auth.users where id = p_user_id;
  select email into v_email from auth.users where id = auth.uid();

  if p_session_id is not null then
    delete from auth.sessions
     where id = p_session_id
       and user_id = p_user_id
       and (v_current is null or id is distinct from v_current);
    get diagnostics v_count = row_count;
    v_scope := 'session';
  elsif p_user_id = auth.uid() then
    delete from auth.sessions
     where user_id = p_user_id
       and (v_current is null or id is distinct from v_current);
    get diagnostics v_count = row_count;
    v_scope := 'others';
  else
    delete from auth.sessions where user_id = p_user_id;
    get diagnostics v_count = row_count;
    v_scope := 'user';
  end if;

  perform public.admin_write_activity(
    auth.uid(),
    v_email,
    'force_logout',
    'admin',
    '/admin/',
    jsonb_build_object(
      'target_user_id', p_user_id,
      'target_email', v_target,
      'session_id', p_session_id,
      'scope', v_scope,
      'revoked', v_count
    )
  );

  return jsonb_build_object('ok', true, 'revoked', v_count, 'scope', v_scope);
end;
$$;

revoke all on function public.admin_force_logout(uuid, uuid) from public, anon;
grant execute on function public.admin_force_logout(uuid, uuid) to authenticated;
