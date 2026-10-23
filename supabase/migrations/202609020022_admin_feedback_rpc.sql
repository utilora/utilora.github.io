-- 管理端读留言改走 RPC，并补回表权限（提交仍只走 Edge Function）。
begin;

revoke insert on table public.feedback from authenticated, anon, public;
grant select, update, delete on table public.feedback to authenticated;
grant insert, select, update, delete on table public.feedback to service_role;

drop policy if exists feedback_authenticated_insert on public.feedback;

drop policy if exists "管理员读取留言" on public.feedback;
create policy "管理员读取留言" on public.feedback
  for select to authenticated using (public.is_admin());

drop policy if exists "管理员更新留言" on public.feedback;
create policy "管理员更新留言" on public.feedback
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "管理员删除留言" on public.feedback;
create policy "管理员删除留言" on public.feedback
  for delete to authenticated using (public.is_admin());

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
  v_status := nullif(trim(coalesce(p_status, '')), '');
  if v_status is not null and v_status not in ('new', 'processing', 'completed', 'closed') then
    raise exception 'invalid status';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into result
  from (
    select id, created_at, name, title, message, contact, status
      from public.feedback
     where (v_status is null or status = v_status)
       and (p_start is null or created_at >= p_start)
       and (p_end is null or created_at <= p_end)
     order by created_at desc
     limit 200
  ) t;
  return result;
end;
$$;

create or replace function public.admin_set_feedback_status(p_id bigint, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_status not in ('new', 'processing', 'completed', 'closed') then
    raise exception 'invalid status';
  end if;
  update public.feedback set status = p_status where id = p_id;
  if not found then
    raise exception 'feedback not found';
  end if;
end;
$$;

create or replace function public.admin_delete_feedback(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  delete from public.feedback where id = p_id;
end;
$$;

revoke all on function public.admin_list_feedback(text, timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_set_feedback_status(bigint, text) from public, anon;
revoke all on function public.admin_delete_feedback(bigint) from public, anon;
grant execute on function public.admin_list_feedback(text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_set_feedback_status(bigint, text) to authenticated;
grant execute on function public.admin_delete_feedback(bigint) to authenticated;

commit;
