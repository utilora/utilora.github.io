begin;

grant usage on schema public to anon, authenticated;

grant select on public.plans to anon, authenticated;
grant select on public.promotions to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.entitlement_grants to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;

grant select, insert, update, delete on public.fiscal_periods to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.catalog_items to authenticated;
grant select, insert, update, delete on public.quotations to authenticated;
grant select, insert, update, delete on public.quotation_items to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.invoice_items to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.bank_accounts to authenticated;
grant select, insert, update, delete on public.bank_transactions to authenticated;
grant select, insert, update, delete on public.chart_of_accounts to authenticated;
grant select, insert, update, delete on public.vouchers to authenticated;
grant select, insert, update, delete on public.voucher_entries to authenticated;
grant select on public.audit_logs to authenticated;

grant select, insert, update, delete on public.reimbursements to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.payroll_runs to authenticated;
grant select, insert, update, delete on public.payroll_items to authenticated;
grant select, insert, update, delete on public.fixed_assets to authenticated;
grant select, insert, update, delete on public.attachments to authenticated;

grant usage, select on all sequences in schema public to authenticated;

commit;