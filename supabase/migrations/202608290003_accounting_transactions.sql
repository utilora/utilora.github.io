begin;

create or replace function public.post_voucher(target_voucher_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  target public.vouchers%rowtype;
  period_status text;
  debit_total numeric(18,2);
  credit_total numeric(18,2);
begin
  select * into target from public.vouchers where id = target_voucher_id for update;
  if target.id is null then raise exception 'voucher not found'; end if;
  if not public.has_org_role(target.organization_id, array['owner','admin','accountant']::public.membership_role[]) then
    raise exception 'permission denied';
  end if;
  if target.status <> 'draft' then raise exception 'only draft vouchers can be posted'; end if;

  select status into period_status from public.fiscal_periods where id = target.fiscal_period_id for update;
  if period_status <> 'open' then raise exception 'fiscal period is closed'; end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into debit_total, credit_total
    from public.voucher_entries where voucher_id = target.id;
  if debit_total = 0 or debit_total <> credit_total then
    raise exception 'voucher is not balanced';
  end if;

  update public.vouchers
  set status = 'posted', posted_at = now(), posted_by = auth.uid()
  where id = target.id;

  insert into public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (target.organization_id, auth.uid(), 'voucher.post', 'voucher', target.id, jsonb_build_object('debit', debit_total, 'credit', credit_total));
end;
$$;

create or replace function public.close_fiscal_period(target_period_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target public.fiscal_periods%rowtype;
begin
  select * into target from public.fiscal_periods where id = target_period_id for update;
  if target.id is null then raise exception 'fiscal period not found'; end if;
  if not public.has_org_role(target.organization_id, array['owner','admin']::public.membership_role[]) then
    raise exception 'permission denied';
  end if;
  if exists(select 1 from public.vouchers where fiscal_period_id = target.id and status = 'draft') then
    raise exception 'draft vouchers must be resolved before closing';
  end if;
  update public.fiscal_periods set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = target.id;
  insert into public.audit_logs(organization_id, actor_id, action, entity_type, entity_id)
  values (target.organization_id, auth.uid(), 'fiscal_period.close', 'fiscal_period', target.id);
end;
$$;

grant execute on function public.post_voucher(uuid) to authenticated;
grant execute on function public.close_fiscal_period(uuid) to authenticated;

commit;