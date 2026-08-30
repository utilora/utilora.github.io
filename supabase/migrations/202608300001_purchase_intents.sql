begin;

create table public.purchase_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  use_case text,
  company_size text,
  intended_plan text not null default 'pro' references public.plans(code),
  created_at timestamptz not null default now(),
  constraint purchase_intents_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint purchase_intents_email_len check (char_length(email) between 3 and 254),
  constraint purchase_intents_use_case_check check (
    use_case is null or use_case in ('银行流水', '应收回款', '月结检查', '经营报表', '其他')
  ),
  constraint purchase_intents_company_size_check check (
    company_size is null or company_size in ('1-10', '11-50', '51-200', '200+')
  ),
  constraint purchase_intents_plan_check check (intended_plan = 'pro'),
  constraint purchase_intents_email_unique unique (email)
);

create unique index purchase_intents_user_id_uidx
  on public.purchase_intents (user_id)
  where user_id is not null;

create index purchase_intents_created_idx on public.purchase_intents (created_at desc);

alter table public.purchase_intents enable row level security;

revoke all on public.purchase_intents from public, anon, authenticated;

create or replace function public.submit_purchase_intent(
  p_email text,
  p_use_case text default null,
  p_company_size text default null,
  p_intended_plan text default 'pro'
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
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_use_case := nullif(trim(coalesce(p_use_case, '')), '');
  v_company_size := nullif(trim(coalesce(p_company_size, '')), '');
  v_plan := coalesce(nullif(trim(coalesce(p_intended_plan, '')), ''), 'pro');

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

  if v_id is null and auth.uid() is not null then
    select id into v_id
    from public.purchase_intents
    where user_id = auth.uid()
    order by created_at
    limit 1;
  end if;


  if v_id is not null then
    if auth.uid() is not null then
      update public.purchase_intents
      set user_id = auth.uid()
      where id = v_id and user_id is null;
    end if;
    return v_id;
  end if;

  begin
    insert into public.purchase_intents (user_id, email, use_case, company_size, intended_plan)
    values (auth.uid(), v_email, v_use_case, v_company_size, v_plan)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id
    from public.purchase_intents
    where email = v_email
       or (auth.uid() is not null and user_id = auth.uid())
    limit 1;
  end;

  return v_id;
end;
$$;

revoke all on function public.submit_purchase_intent(text, text, text, text) from public;
grant execute on function public.submit_purchase_intent(text, text, text, text) to anon, authenticated;

commit;
