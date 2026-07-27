-- CrewQuote Supabase Phase 1
-- Local-only schema scaffold for future auth-backed persistence.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  create type public.currency_code as enum ('ZAR', 'USD', 'GBP', 'EUR');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.invoice_detail_mode as enum ('summary', 'detailed', 'summary_timesheet');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.invoice_line_category as enum ('day-rate', 'overtime', 'equipment', 'travel', 'expenses', 'turnaround', 'additional');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.invoice_status as enum ('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.overtime_rule_id as enum ('sa-film', 'sa-bcea', 'custom');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.timesheet_status as enum ('open', 'submitted', 'invoiced');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.turnaround_mode as enum ('warning', 'penalty', 'manual');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default '',
  company_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  vat_registered boolean not null default false,
  vat_number text not null default '',
  invoice_label text not null default 'Invoice',
  payment_terms text not null default 'Payment due within 30 days',
  invoice_number_history text[] not null default '{}'::text[],
  default_currency public.currency_code not null default 'ZAR',
  default_day_rate numeric(12, 2) not null default 0,
  default_included_hours numeric(6, 2) not null default 10,
  default_equipment_rental numeric(12, 2) not null default 0,
  default_per_diem numeric(12, 2) not null default 0,
  default_vat numeric(5, 2) not null default 0,
  default_overtime_rule public.overtime_rule_id not null default 'sa-film',
  default_ot_band1_hours numeric(6, 2) not null default 4,
  default_ot_band1_mult numeric(6, 3) not null default 1.5,
  default_ot_band2_mult numeric(6, 3) not null default 2,
  default_min_turnaround numeric(6, 2) not null default 10,
  default_turnaround_mode public.turnaround_mode not null default 'warning',
  default_turnaround_pen_mult numeric(6, 3) not null default 1.5,
  meal_breaks_deducted boolean not null default true,
  travel_time_paid boolean not null default true,
  equipment_rental_daily boolean not null default true,
  bank_account_name text not null default '',
  bank_name text not null default '',
  bank_account_number text not null default '',
  bank_branch_code text not null default '',
  bank_swift text not null default '',
  bank_iban text not null default '',
  bank_reference text not null default '',
  business_logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_invoice_label_not_blank check (char_length(trim(invoice_label)) > 0),
  constraint profiles_money_nonnegative check (
    default_day_rate >= 0
    and default_equipment_rental >= 0
    and default_per_diem >= 0
  ),
  constraint profiles_hours_valid check (
    default_included_hours >= 0
    and default_ot_band1_hours >= 0
    and default_min_turnaround >= 0
  ),
  constraint profiles_multipliers_valid check (
    default_ot_band1_mult >= 0
    and default_ot_band2_mult >= 0
    and default_turnaround_pen_mult >= 0
  ),
  constraint profiles_vat_percent_valid check (default_vat between 0 and 100),
  constraint profiles_business_logo_owner_path check (
    business_logo_path is null
    or business_logo_path like (id::text || '/%')
  )
);

create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text not null default '',
  contact_person text not null default '',
  email text not null default '',
  phone text not null default '',
  billing_address text not null default '',
  vat_number text not null default '',
  po_required boolean not null default false,
  vendor_number text not null default '',
  accounts_email text not null default '',
  payment_terms text not null default '',
  default_payment_terms text not null default '',
  preferred_invoice_detail_mode public.invoice_detail_mode not null default 'summary',
  rate_memory jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint clients_rate_memory_object check (rate_memory is null or jsonb_typeof(rate_memory) = 'object')
);

create trigger set_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timesheet_number text not null,
  production_name text not null default '',
  client_id uuid,
  client_name text,
  client_incomplete boolean not null default false,
  crew_name text not null default '',
  role text not null default '',
  start_date date,
  notes text,
  currency public.currency_code not null default 'ZAR',
  vat numeric(5, 2) not null default 0,
  status public.timesheet_status not null default 'open',
  payment_terms text,
  default_day_rate numeric(12, 2),
  default_included_hours numeric(6, 2),
  default_equipment_rental numeric(12, 2),
  default_per_diem numeric(12, 2),
  default_overtime_rule public.overtime_rule_id,
  default_ot_band1_hours numeric(6, 2),
  default_ot_band1_mult numeric(6, 3),
  default_ot_band2_mult numeric(6, 3),
  default_min_turnaround numeric(6, 2),
  default_turnaround_mode public.turnaround_mode,
  default_turnaround_pen_mult numeric(6, 3),
  meal_breaks_deducted boolean,
  travel_time_paid boolean,
  equipment_rental_daily boolean,
  invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, timesheet_number),
  constraint timesheets_client_owner_fk foreign key (user_id, client_id) references public.clients(user_id, id) on update cascade on delete restrict,
  constraint timesheets_number_not_blank check (char_length(trim(timesheet_number)) > 0),
  constraint timesheets_vat_percent_valid check (vat between 0 and 100),
  constraint timesheets_default_amounts_nonnegative check (
    (default_day_rate is null or default_day_rate >= 0)
    and (default_equipment_rental is null or default_equipment_rental >= 0)
    and (default_per_diem is null or default_per_diem >= 0)
  ),
  constraint timesheets_default_hours_valid check (
    (default_included_hours is null or default_included_hours >= 0)
    and (default_ot_band1_hours is null or default_ot_band1_hours >= 0)
    and (default_min_turnaround is null or default_min_turnaround >= 0)
  ),
  constraint timesheets_default_multipliers_valid check (
    (default_ot_band1_mult is null or default_ot_band1_mult >= 0)
    and (default_ot_band2_mult is null or default_ot_band2_mult >= 0)
    and (default_turnaround_pen_mult is null or default_turnaround_pen_mult >= 0)
  )
);

create trigger set_timesheets_updated_at
before update on public.timesheets
for each row execute function public.set_updated_at();

create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  timesheet_id uuid not null,
  entry_order integer not null default 0,
  date date not null,
  production_name text not null default '',
  location text not null default '',
  notes text not null default '',
  call_time time without time zone,
  wrap_time time without time zone,
  meal_break_minutes integer not null default 0,
  meal_deducted boolean not null default true,
  travel_start_time time without time zone,
  travel_end_time time without time zone,
  travel_distance text not null default '',
  travel_paid boolean not null default true,
  day_rate numeric(12, 2) not null default 0,
  included_hours numeric(6, 2) not null default 10,
  overtime_rule public.overtime_rule_id not null default 'sa-film',
  ot_band1_hours numeric(6, 2) not null default 4,
  ot_band1_mult numeric(6, 3) not null default 1.5,
  ot_band2_mult numeric(6, 3) not null default 2,
  equipment_rental numeric(12, 2) not null default 0,
  per_diem numeric(12, 2) not null default 0,
  expenses numeric(12, 2) not null default 0,
  expense_description text not null default '',
  rate_snapshot jsonb not null default '{}'::jsonb,
  calc_snapshot jsonb not null default '{}'::jsonb,
  is_sunday boolean not null default false,
  is_public_holiday boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, timesheet_id, entry_order),
  constraint timesheet_entries_timesheet_owner_fk foreign key (user_id, timesheet_id) references public.timesheets(user_id, id) on update cascade on delete cascade,
  constraint timesheet_entries_order_nonnegative check (entry_order >= 0),
  constraint timesheet_entries_meal_minutes_valid check (meal_break_minutes >= 0 and meal_break_minutes <= 1440),
  constraint timesheet_entries_amounts_nonnegative check (
    day_rate >= 0
    and equipment_rental >= 0
    and per_diem >= 0
    and expenses >= 0
  ),
  constraint timesheet_entries_hours_valid check (
    included_hours >= 0
    and ot_band1_hours >= 0
  ),
  constraint timesheet_entries_multipliers_valid check (
    ot_band1_mult >= 0
    and ot_band2_mult >= 0
  ),
  constraint timesheet_entries_snapshots_object check (
    jsonb_typeof(rate_snapshot) = 'object'
    and jsonb_typeof(calc_snapshot) = 'object'
  )
);

create trigger set_timesheet_entries_updated_at
before update on public.timesheet_entries
for each row execute function public.set_updated_at();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  po_number text,
  issue_date date not null,
  due_date date not null,
  client_id uuid,
  client_name text not null default '',
  crew_name text not null default '',
  role text not null default '',
  company_name text not null default '',
  seller_logo_path text,
  seller_snapshot jsonb,
  production_name text,
  timesheet_number text not null default '',
  timesheet_dates text,
  detail_mode public.invoice_detail_mode not null default 'detailed',
  subtotal numeric(12, 2) not null default 0,
  vat numeric(5, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  paid_date date,
  balance_due numeric(12, 2) not null default 0,
  currency public.currency_code not null default 'ZAR',
  status public.invoice_status not null default 'draft',
  banking jsonb not null default '{}'::jsonb,
  payment_terms text,
  payment_notes text not null default '',
  notes text,
  from_timesheet_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, invoice_number),
  constraint invoices_client_owner_fk foreign key (user_id, client_id) references public.clients(user_id, id) on update cascade on delete restrict,
  constraint invoices_timesheet_owner_fk foreign key (user_id, from_timesheet_id) references public.timesheets(user_id, id) on update cascade on delete restrict,
  constraint invoices_number_not_blank check (char_length(trim(invoice_number)) > 0),
  constraint invoices_due_not_before_issue check (due_date >= issue_date),
  constraint invoices_vat_percent_valid check (vat between 0 and 100),
  constraint invoices_amounts_nonnegative check (
    subtotal >= 0
    and vat_amount >= 0
    and total >= 0
    and paid_amount >= 0
    and balance_due >= 0
  ),
  constraint invoices_paid_not_above_total check (paid_amount <= total),
  constraint invoices_json_objects check (
    (seller_snapshot is null or jsonb_typeof(seller_snapshot) = 'object')
    and jsonb_typeof(banking) = 'object'
  ),
  constraint invoices_seller_logo_owner_path check (
    seller_logo_path is null
    or seller_logo_path like (user_id::text || '/%')
  )
);

create trigger set_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

alter table public.timesheets
  add constraint timesheets_invoice_owner_fk
  foreign key (user_id, invoice_id) references public.invoices(user_id, id) on update cascade on delete restrict;

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null,
  line_order integer not null default 0,
  description text not null default '',
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  amount numeric(12, 2) not null default 0,
  is_extra boolean not null default false,
  taxable boolean not null default true,
  category public.invoice_line_category not null default 'additional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, invoice_id, line_order),
  constraint invoice_lines_invoice_owner_fk foreign key (user_id, invoice_id) references public.invoices(user_id, id) on update cascade on delete cascade,
  constraint invoice_lines_order_nonnegative check (line_order >= 0),
  constraint invoice_lines_amounts_nonnegative check (
    quantity >= 0
    and unit_price >= 0
    and amount >= 0
  )
);

create trigger set_invoice_lines_updated_at
before update on public.invoice_lines
for each row execute function public.set_updated_at();

create index clients_user_id_idx on public.clients(user_id);
create index timesheets_user_id_idx on public.timesheets(user_id);
create index timesheets_client_id_idx on public.timesheets(user_id, client_id);
create index timesheet_entries_timesheet_id_idx on public.timesheet_entries(user_id, timesheet_id);
create index invoices_user_id_idx on public.invoices(user_id);
create index invoices_client_id_idx on public.invoices(user_id, client_id);
create index invoices_from_timesheet_id_idx on public.invoices(user_id, from_timesheet_id);
create index invoices_status_idx on public.invoices(user_id, status);
create index invoice_lines_invoice_id_idx on public.invoice_lines(user_id, invoice_id);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.timesheets enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Users can delete own profile"
on public.profiles
for delete
to authenticated
using (id = auth.uid());

create policy "Users can read own clients"
on public.clients
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own clients"
on public.clients
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own clients"
on public.clients
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own clients"
on public.clients
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own timesheets"
on public.timesheets
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own timesheets"
on public.timesheets
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own timesheets"
on public.timesheets
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own timesheets"
on public.timesheets
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own timesheet entries"
on public.timesheet_entries
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own timesheet entries"
on public.timesheet_entries
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own timesheet entries"
on public.timesheet_entries
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own timesheet entries"
on public.timesheet_entries
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own invoices"
on public.invoices
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own invoices"
on public.invoices
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own invoices"
on public.invoices
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own invoices"
on public.invoices
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own invoice lines"
on public.invoice_lines
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own invoice lines"
on public.invoice_lines
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own invoice lines"
on public.invoice_lines
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own invoice lines"
on public.invoice_lines
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table
  public.profiles,
  public.clients,
  public.timesheets,
  public.timesheet_entries,
  public.invoices,
  public.invoice_lines
from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.clients,
  public.timesheets,
  public.timesheet_entries,
  public.invoices,
  public.invoice_lines
to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos',
  'business-logos',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read own business logos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can insert own business logos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update own business logos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own business logos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
