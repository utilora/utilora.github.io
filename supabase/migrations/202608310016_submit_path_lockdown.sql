-- 提交路径收口：购买意向不可直连；留言表去掉登录用户改/删/清空；仅服务端可写。

begin;

drop function if exists public.submit_purchase_intent(text, text, text, text);

create or replace function public.submit_purchase_intent(
  p_email text,
  p_use_case text default null,
  p_company_size text default null,
  p_intended_plan text default 'pro',
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_use_case text;
  v_company_size text;
  v_plan text;
  v_id uuid;
  v_uid uuid;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_use_case := nullif(trim(coalesce(p_use_case, '')), '');
  v_company_size := nullif(trim(coalesce(p_company_size, '')), '');
  v_plan := coalesce(nullif(trim(coalesce(p_intended_plan, '')), ''), 'pro');
  v_uid := auth.uid();
  if v_uid is null then
    v_uid := p_user_id;
  end if;

  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email';
  end if;
  if v_plan <> 'pro' then
    raise exception 'invalid plan';
  end if;
  if v_use_case is not null and v_use_case not in ('银行流水', '应收回款', '月结检查', '经营报表', '其他') then
    raise exception 'invalid use_case';
  end if;
  if v_company_size is not null and v_company_size not in ('1-10', '11-50', '51-200', '200+') then
    raise exception 'invalid company_size';
  end if;

  select id into v_id
  from public.purchase_intents
  where email = v_email
  order by created_at
  limit 1;

  if v_id is null and v_uid is not null then
    select id into v_id
    from public.purchase_intents
    where user_id = v_uid
    order by created_at
    limit 1;
  end if;

  if v_id is not null then
    if v_uid is not null then
      update public.purchase_intents
      set user_id = v_uid
      where id = v_id and user_id is null;
    end if;
    return v_id;
  end if;

  begin
    insert into public.purchase_intents (user_id, email, use_case, company_size, intended_plan)
    values (v_uid, v_email, v_use_case, v_company_size, v_plan)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.purchase_intents
    where email = v_email
       or (v_uid is not null and user_id = v_uid)
    limit 1;
  end;

  return v_id;
end;
$$;

revoke all on function public.submit_purchase_intent(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_purchase_intent(text, text, text, text, uuid) to service_role;

grant execute on function public.check_public_submit_allowed(text, text, text) to service_role;
grant execute on function public.record_public_submit(text, text, text) to service_role;

do $$
begin
  if to_regclass('public.feedback') is null then
    return;
  end if;
  revoke all on table public.feedback from public, anon, authenticated;
  grant insert, select, update, delete on table public.feedback to service_role;
  drop policy if exists feedback_authenticated_insert on public.feedback;
  drop policy if exists "访客可以提交留言" on public.feedback;
end;
$$;

commit;
