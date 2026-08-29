begin;

create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  applicant_id uuid references auth.users(id),
  submitted_date date,
  description text not null,
  amount numeric(18,2) not null check (amount > 0),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'paid', 'rejected')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_number text not null,
  name text not null,
  identity_number_encrypted text,
  bank_account_encrypted text,
  employment_status text not null default 'active' check (employment_status in ('active', 'inactive')),
  joined_on date,
  left_on date,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, employee_number)
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_period_id uuid not null references public.fiscal_periods(id),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'calculated', 'approved', 'paid', 'void')),
  gross_total numeric(18,2) not null default 0,
  employee_deduction_total numeric(18,2) not null default 0,
  employer_cost_total numeric(18,2) not null default 0,
  individual_tax_total numeric(18,2) not null default 0,
  net_total numeric(18,2) not null default 0,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, fiscal_period_id, name)
);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  gross_amount numeric(18,2) not null default 0,
  social_employee numeric(18,2) not null default 0,
  housing_employee numeric(18,2) not null default 0,
  individual_tax numeric(18,2) not null default 0,
  other_deductions numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  social_employer numeric(18,2) not null default 0,
  housing_employer numeric(18,2) not null default 0,
  employer_cost numeric(18,2) not null default 0,
  calculation_snapshot jsonb not null default '{}'::jsonb,
  unique (payroll_run_id, employee_id)
);

create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_number text not null,
  name text not null,
  category text not null,
  acquired_on date not null,
  original_cost numeric(18,2) not null check (original_cost >= 0),
  residual_rate numeric(7,6) not null default 0 check (residual_rate between 0 and 1),
  useful_life_months integer not null check (useful_life_months > 0),
  depreciation_method text not null default 'straight_line' check (depreciation_method in ('straight_line')),
  accumulated_depreciation numeric(18,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'disposed')),
  disposed_on date,
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, asset_number)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null unique,
  file_name text not null,
  content_type text,
  size_bytes bigint check (size_bytes >= 0),
  checksum text,
  uploaded_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger reimbursements_touch before update on public.reimbursements for each row execute function public.touch_updated_at();
create trigger employees_touch before update on public.employees for each row execute function public.touch_updated_at();
create trigger payroll_runs_touch before update on public.payroll_runs for each row execute function public.touch_updated_at();
create trigger fixed_assets_touch before update on public.fixed_assets for each row execute function public.touch_updated_at();

create index reimbursements_org_status_idx on public.reimbursements(organization_id, status) where deleted_at is null;
create index employees_org_status_idx on public.employees(organization_id, employment_status) where deleted_at is null;
create index payroll_runs_org_period_idx on public.payroll_runs(organization_id, fiscal_period_id);
create index fixed_assets_org_status_idx on public.fixed_assets(organization_id, status) where deleted_at is null;
create index attachments_entity_idx on public.attachments(organization_id, entity_type, entity_id) where deleted_at is null;

alter table public.reimbursements enable row level security;
alter table public.employees enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_items enable row level security;
alter table public.fixed_assets enable row level security;
alter table public.attachments enable row level security;

create policy reimbursements_member_all on public.reimbursements for all
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy employees_member_all on public.employees for all
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy payroll_runs_member_all on public.payroll_runs for all
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy payroll_items_member_all on public.payroll_items for all
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy fixed_assets_member_all on public.fixed_assets for all
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));
create policy attachments_member_all on public.attachments for all
  using (public.is_org_member(organization_id))
  with check (public.has_org_role(organization_id, array['owner','admin','accountant']::public.membership_role[]));

commit;