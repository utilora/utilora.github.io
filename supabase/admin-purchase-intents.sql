-- 在 Supabase SQL Editor 中整份执行一次
-- 依赖 public.is_admin()（见 supabase/admin-policies.sql）
-- 管理员只读购买意向：不开放表权限，仅通过 security definer RPC 读取

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
      i.user_id
    from public.purchase_intents i
  ) t;
  return result;
end;
$$;

revoke all on function public.admin_list_purchase_intents() from public, anon;
grant execute on function public.admin_list_purchase_intents() to authenticated;
