-- 管理端一键停止弹出：公告立即过期，用户端不再出现。

create or replace function public.admin_expire_announcement(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_active boolean;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_id is null then
    raise exception 'invalid announcement';
  end if;

  select title, is_active, starts_at into v_title, v_active, v_starts
  from public.announcements
  where id = p_id;
  if v_title is null then
    raise exception 'announcement not found';
  end if;

  v_ends := now();
  if v_starts is not null and v_ends <= v_starts then
    v_ends := v_starts + interval '1 second';
  end if;

  update public.announcements
    set is_active = false,
        ends_at = v_ends,
        updated_at = now()
  where id = p_id;

  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'announcement_expire',
    'admin',
    '/admin/',
    jsonb_build_object('id', p_id, 'title', v_title, 'was_active', v_active, 'ends_at', v_ends)
  );

  return jsonb_build_object('id', p_id, 'title', v_title, 'is_active', false, 'ends_at', v_ends);
end;
$$;

revoke all on function public.admin_expire_announcement(uuid) from public, anon;
grant execute on function public.admin_expire_announcement(uuid) to authenticated;
