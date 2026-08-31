-- 功能建议改为登录后提交：authenticated 可 insert，不能读他人留言

begin;

do $$
begin
  if to_regclass('public.feedback') is null then
    return;
  end if;
  revoke all on table public.feedback from public, anon;
  grant insert on table public.feedback to authenticated;
  drop policy if exists feedback_authenticated_insert on public.feedback;
  create policy feedback_authenticated_insert on public.feedback
    for insert to authenticated
    with check (true);
end;
$$;

commit;
