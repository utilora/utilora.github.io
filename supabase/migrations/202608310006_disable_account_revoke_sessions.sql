-- S-07: 停用账号后 refresh 立即失效
-- 1) 停用时删除该用户 auth.sessions，使 refresh_token 无法再换取 access_token
-- 2) 登录/刷新前可通过 account_is_disabled 检测；客户端在 refresh 失败或检测到停用后清会话
-- 本迁移幂等。

begin;

-- 确保 user_flags 存在（与 admin-users.sql 对齐）
create table if not exists public.user_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_disabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_flags enable row level security;
revoke all on public.user_flags from public, anon, authenticated;

-- 撤销指定用户全部会话（refresh 立即失效；已签发的 access JWT 仍有效至 exp）
create or replace function public.revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
begin
  if p_user_id is null then
    return 0;
  end if;
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;

-- 覆盖 admin 停用：写入 flags 后，若停用则立即撤销会话
create or replace function public.admin_set_user_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise insufficient_privilege;
  end if;
  if p_user_id is null then
    raise exception 'invalid user';
  end if;
  if p_user_id = auth.uid() and coalesce(p_disabled, false) then
    raise exception '不能停用当前登录的管理员';
  end if;
  insert into public.user_flags(user_id, is_disabled, updated_at)
  values (p_user_id, coalesce(p_disabled, false), now())
  on conflict (user_id) do update
    set is_disabled = excluded.is_disabled,
        updated_at = now();
  if coalesce(p_disabled, false) then
    perform public.revoke_user_sessions(p_user_id);
  end if;
end;
$$;

revoke all on function public.admin_set_user_disabled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_disabled(uuid, boolean) to authenticated;

-- 本人可查询是否停用（供 refresh / 会话校验）
create or replace function public.account_is_disabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select is_disabled from public.user_flags where user_id = auth.uid()
  ), false);
$$;

revoke all on function public.account_is_disabled() from public, anon;
grant execute on function public.account_is_disabled() to authenticated;

commit;
