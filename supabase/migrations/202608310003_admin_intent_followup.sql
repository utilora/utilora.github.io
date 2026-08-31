-- A-03 意向跟进：下次跟进日、结果、标记已发试用
-- 扩展 purchase_intent_followups，并替换 admin_list / admin_set RPC

begin;

alter table public.purchase_intent_followups
  add column if not exists next_follow_on date,
  add column if not exists result text,
  add column if not exists trial_granted boolean not null default false;

alter table public.purchase_intent_followups
  drop constraint if exists purchase_intent_followups_result_check;

alter table public.purchase_intent_followups
  add constraint purchase_intent_followups_result_check
  check (result is null or result in ('interested', 'considering', 'no_response', 'declined'));

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
      i.user_id,
      coalesce(f.status, 'new') as follow_status,
      f.note as follow_note,
      f.next_follow_on,
      f.result as follow_result,
      coalesce(f.trial_granted, false) as trial_granted,
      f.updated_at as follow_updated_at
    from public.purchase_intents i
    left join public.purchase_intent_followups f on f.intent_id = i.id
  ) t;
  return result;
end;
$$;
revoke all on function public.admin_list_purchase_intents() from public, anon;
grant execute on function public.admin_list_purchase_intents() to authenticated;

drop function if exists public.admin_set_purchase_intent_followup(uuid, text, text);

create or replace function public.admin_set_purchase_intent_followup(
  p_intent_id uuid,
  p_status text,
  p_note text default null,
  p_next_follow_on date default null,
  p_result text default null,
  p_trial_granted boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_result text;
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
  insert into public.purchase_intent_followups(
    intent_id, status, note, next_follow_on, result, trial_granted, updated_at, updated_by
  )
  values (
    p_intent_id,
    p_status,
    nullif(left(trim(coalesce(p_note, '')), 500), ''),
    p_next_follow_on,
    v_result,
    coalesce(p_trial_granted, false),
    now(),
    auth.uid()
  )
  on conflict (intent_id) do update
    set status = excluded.status,
        note = excluded.note,
        next_follow_on = excluded.next_follow_on,
        result = excluded.result,
        trial_granted = excluded.trial_granted,
        updated_at = now(),
        updated_by = auth.uid();
  perform public.admin_write_activity(
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    'intent_followup',
    'admin',
    '/admin/',
    jsonb_build_object(
      'intent_id', p_intent_id,
      'email', v_email,
      'status', p_status,
      'next_follow_on', p_next_follow_on,
      'result', v_result,
      'trial_granted', coalesce(p_trial_granted, false)
    )
  );
end;
$$;
revoke all on function public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean) from public, anon;
grant execute on function public.admin_set_purchase_intent_followup(uuid, text, text, date, text, boolean) to authenticated;

commit;
