begin;

create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner', 'admin', 'accountant', 'viewer');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
create type public.document_status as enum ('draft', 'issued', 'partial', 'paid', 'void');
create type public.voucher_status as enum ('draft', 'posted', 'reversed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text not null default 'zh-CN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('free', 'pro_trial', 'pro')),
  name text not null,
  billing_period text check (billing_period in ('month', 'year') or billing_period is null),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency char(3) not null default 'CNY',
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status public.subscription_status not null,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (provider, provider_subscription_id)
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  plan_code text not null references public.plans(code),
  audience text not null default 'authenticated' check (audience in ('authenticated', 'invite_only')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code),
  source text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_identifier text,
  base_currency char(3) not null default 'CNY',
  timezone text not null default 'Asia/Shanghai',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'viewer',
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year smallint not null check (year between 2000 and 2200),
  month smallint not null check (month between 1 and 12),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  unique (organization_id, year, month)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  tax_identifier text,
  email text,
  phone text,
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unit text,
  unit_price numeric(18,2) not null default 0,
  tax_rate numeric(7,6) not null default 0 check (tax_rate between 0 and 1),
  is_active boolean not null default true,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id),
  document_number text not null,
  status public.document_status not null default 'draft',
  issue_date date not null default current_date,
  valid_until date,
  currency char(3) not null default 'CNY',
  subtotal numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  notes text,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, document_number)
);

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  quantity numeric(18,4) not null default 1,
  unit text,
  unit_price numeric(18,2) not null default 0,
  tax_rate numeric(7,6) not null default 0 check (tax_rate between 0 and 1),
  line_subtotal numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0,
  sort_order integer not null default 0
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id),
  quotation_id uuid references public.quotations(id),
  document_number text not null,
  status public.document_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  currency char(3) not null default 'CNY',
  subtotal numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  paid_total numeric(18,2) not null default 0,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, document_number),
  check (paid_total >= 0 and paid_total <= grand_total)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null,
  quantity numeric(18,4) not null default 1,
  unit text,
  unit_price numeric(18,2) not null default 0,
  tax_rate numeric(7,6) not null default 0 check (tax_rate between 0 and 1),
  line_subtotal numeric(18,2) not null default 0,
  line_tax numeric(18,2) not null default 0,
  line_total numeric(18,2) not null default 0,
  sort_order integer not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id),
  invoice_id uuid references public.invoices(id),
  amount numeric(18,2) not null check (amount > 0),
  currency char(3) not null default 'CNY',
  paid_at timestamptz not null,
  method text,
  reference text,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_date date not null,
  category text not null,
  vendor text,
  description text,
  amount_excluding_tax numeric(18,2) not null default 0,
  tax_amount numeric(18,2) not null default 0,
  total_amount numeric(18,2) generated always as (amount_excluding_tax + tax_amount) stored,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'paid', 'rejected')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  bank_name text,
  account_number_masked text,
  currency char(3) not null default 'CNY',
  opening_balance numeric(18,2) not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete cascade,
  transaction_date date not null,
  amount numeric(18,2) not null,
  counterparty text,
  reference text,
  fingerprint text,
  matched_payment_id uuid references public.payments(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, bank_account_id, fingerprint)
);

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null check (category in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_active boolean not null default true,
  unique (organization_id, code)
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_period_id uuid not null references public.fiscal_periods(id),
  voucher_number text not null,
  voucher_date date not null,
  summary text,
  status public.voucher_status not null default 'draft',
  posted_at timestamptz,
  posted_by uuid references auth.users(id),
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, voucher_number)
);

create table public.voucher_entries (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts(id),
  description text,
  debit numeric(18,2) not null default 0 check (debit >= 0),
  credit numeric(18,2) not null default 0 check (credit >= 0),
  sort_order integer not null default 0,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index customers_org_idx on public.customers(organization_id) where deleted_at is null;
create index quotations_org_date_idx on public.quotations(organization_id, issue_date desc) where deleted_at is null;
create index invoices_org_due_idx on public.invoices(organization_id, due_date) where deleted_at is null;
create index payments_org_paid_idx on public.payments(organization_id, paid_at desc) where deleted_at is null;
create index bank_transactions_org_date_idx on public.bank_transactions(organization_id, transaction_date desc);
create index vouchers_org_date_idx on public.vouchers(organization_id, voucher_date desc);
create index audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  if to_jsonb(new) ? 'version' then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger catalog_items_touch before update on public.catalog_items for each row execute function public.touch_updated_at();
create trigger quotations_touch before update on public.quotations for each row execute function public.touch_updated_at();
create trigger invoices_touch before update on public.invoices for each row execute function public.touch_updated_at();
create trigger expenses_touch before update on public.expenses for each row execute function public.touch_updated_at();
create trigger vouchers_touch before update on public.vouchers for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed public.membership_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid() and role = any(allowed)
  );
$$;

create or replace function public.create_organization(org_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if length(trim(org_name)) < 2 then raise exception 'organization name too short'; end if;
  insert into public.organizations(name, created_by) values (trim(org_name), auth.uid()) returning id into new_id;
  insert into public.organization_members(organization_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

create or replace function public.get_my_effective_entitlement()
returns table(plan_code text, pro_access boolean, source text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  with active_promotion as (
    select p.plan_code, p.ends_at
    from public.promotions p
    where auth.uid() is not null
      and p.is_active
      and p.audience = 'authenticated'
      and p.starts_at <= now()
      and (p.ends_at is null or p.ends_at > now())
    order by p.starts_at desc limit 1
  ), active_grant as (
    select g.plan_code, g.ends_at
    from public.entitlement_grants g
    where g.user_id = auth.uid()
      and g.starts_at <= now()
      and (g.ends_at is null or g.ends_at > now())
    order by g.ends_at desc nulls first limit 1
  ), active_subscription as (
    select p.code as plan_code, s.current_period_end as ends_at
    from public.subscriptions s join public.plans p on p.id = s.plan_id
    where s.user_id = auth.uid()
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.current_period_end desc nulls first limit 1
  )
  select plan_code, plan_code in ('pro_trial', 'pro'), 'grant', ends_at from active_grant
  union all
  select plan_code, plan_code in ('pro_trial', 'pro'), 'subscription', ends_at from active_subscription
  where not exists(select 1 from active_grant)
  union all
  select plan_code, plan_code in ('pro_trial', 'pro'), 'promotion', ends_at from active_promotion
  where not exists(select 1 from active_grant) and not exists(select 1 from active_subscription)
  union all
  select 'free', false, 'none', null::timestamptz
  where not exists(select 1 from active_grant)
    and not exists(select 1 from active_subscription)
    and not exists(select 1 from active_promotion)
  limit 1;
$$;

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.promotions enable row level security;
alter table public.entitlement_grants enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.fiscal_periods enable row level security;
alter table public.customers enable row level security;
alter table public.catalog_items enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.vouchers enable row level security;
alter table public.voucher_entries enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy plans_public_read on public.plans for select using (is_active);
create policy subscriptions_self_read on public.subscriptions for select using (user_id = auth.uid());
create policy promotions_authenticated_read on public.promotions for select to authenticated using (is_active and audience = 'authenticated');
create policy grants_self_read on public.entitlement_grants for select using (user_id = auth.uid());
create policy organizations_member_read on public.organizations for select using (public.is_org_member(id));
create policy organizations_admin_update on public.organizations for update using (public.has_org_role(id, array['owner','admin']::public.membership_role[]));
create policy members_member_read on public.organization_members for select using (public.is_org_member(organization_id));
create policy members_admin_write on public.organization_members for all
  using (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

create policy fiscal_member_all on public.fiscal_periods for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy customers_member_all on public.customers for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy catalog_member_all on public.catalog_items for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy quotations_member_all on public.quotations for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy quotation_items_member_all on public.quotation_items for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy invoices_member_all on public.invoices for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy invoice_items_member_all on public.invoice_items for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy payments_member_all on public.payments for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy expenses_member_all on public.expenses for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy bank_accounts_member_all on public.bank_accounts for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy bank_transactions_member_all on public.bank_transactions for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy accounts_member_all on public.chart_of_accounts for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy vouchers_member_all on public.vouchers for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy voucher_entries_member_all on public.voucher_entries for all using (public.is_org_member(organization_id)) with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy audit_admin_read on public.audit_logs for select using (organization_id is not null and public.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

insert into public.plans(code, name, billing_period, price_cents, features) values
  ('free', '免费版', null, 0, '{"free_tools":true}'::jsonb),
  ('pro_trial', '专业版试用', null, 0, '{"professional_workspace":true}'::jsonb),
  ('pro', '财务专业版', 'month', 0, '{"professional_workspace":true,"multi_organization":true,"exports":true}'::jsonb);

insert into public.promotions(code, name, plan_code, audience, starts_at, ends_at, is_active, config)
values ('pro-launch-free', '财务专业版内测限免', 'pro_trial', 'authenticated', now(), null, true, '{"auto_grant":true,"payment_required":false}'::jsonb);

grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.get_my_effective_entitlement() to authenticated;

commit;