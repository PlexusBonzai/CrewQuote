-- CrewQuote Supabase Phase 1 schema completion.
-- Additive follow-up to the validated initial migration.

do $$
begin
  create type public.invoice_line_source_type as enum ('manual', 'timesheet', 'timesheet_entry', 'day_expense', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.import_batch_status as enum ('started', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

create table public.business_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null default '',
  trading_name text not null default '',
  role text not null default '',
  business_email text not null default '',
  phone text not null default '',
  billing_address text not null default '',
  vat_registered boolean not null default false,
  vat_number text not null default '',
  tax_number text not null default '',
  invoice_label text not null default 'Invoice',
  invoice_number_prefix text not null default '',
  next_invoice_number integer not null default 1,
  invoice_number_history text[] not null default '{}'::text[],
  default_invoice_detail_mode public.invoice_detail_mode not null default 'detailed',
  default_currency public.currency_code not null default 'ZAR',
  default_day_rate numeric(12, 2) not null default 0,
  default_included_hours numeric(6, 2) not null default 10,
  default_equipment_rental numeric(12, 2) not null default 0,
  default_per_diem numeric(12, 2) not null default 0,
  default_vat numeric(5, 2) not null default 0,
  payment_terms text not null default 'Payment due within 30 days',
  bank_account_name text not null default '',
  bank_name text not null default '',
  bank_account_number text not null default '',
  bank_branch_code text not null default '',
  bank_swift text not null default '',
  bank_iban text not null default '',
  bank_reference text not null default '',
  default_overtime_rule public.overtime_rule_id not null default 'sa-film',
  default_ot_band1_hours numeric(6, 2) not null default 4,
  default_ot_band1_mult numeric(6, 3) not null default 1.5,
  default_ot_band2_mult numeric(6, 3) not null default 2,
  overtime_config jsonb not null default '{}'::jsonb,
  default_min_turnaround numeric(6, 2) not null default 10,
  default_turnaround_mode public.turnaround_mode not null default 'warning',
  default_turnaround_pen_mult numeric(6, 3) not null default 1.5,
  turnaround_config jsonb not null default '{}'::jsonb,
  invoice_preferences jsonb not null default '{}'::jsonb,
  business_logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (user_id, id),
  constraint business_settings_invoice_label_not_blank check (char_length(trim(invoice_label)) > 0),
  constraint business_settings_next_invoice_number_positive check (next_invoice_number >= 1),
  constraint business_settings_money_nonnegative check (
    default_day_rate >= 0
    and default_equipment_rental >= 0
    and default_per_diem >= 0
  ),
  constraint business_settings_hours_valid check (
    default_included_hours >= 0
    and default_ot_band1_hours >= 0
    and default_min_turnaround >= 0
  ),
  constraint business_settings_multipliers_valid check (
    default_ot_band1_mult >= 0
    and default_ot_band2_mult >= 0
    and default_turnaround_pen_mult >= 0
  ),
  constraint business_settings_vat_percent_valid check (default_vat between 0 and 100),
  constraint business_settings_json_objects check (
    jsonb_typeof(overtime_config) = 'object'
    and jsonb_typeof(turnaround_config) = 'object'
    and jsonb_typeof(invoice_preferences) = 'object'
  ),
  constraint business_settings_logo_owner_path check (
    business_logo_path is null
    or business_logo_path like (user_id::text || '/%')
  )
);

create trigger set_business_settings_updated_at
before update on public.business_settings
for each row execute function public.set_updated_at();

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  onboarding_dismissed boolean not null default false,
  ui_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (user_id, id),
  constraint user_preferences_ui_preferences_object check (jsonb_typeof(ui_preferences) = 'object')
);

create trigger set_user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create table public.rate_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text,
  name text not null,
  preset_type text not null default 'custom',
  currency public.currency_code not null default 'ZAR',
  day_rate numeric(12, 2) not null default 0,
  included_hours numeric(6, 2) not null default 10,
  equipment_rental numeric(12, 2) not null default 0,
  per_diem numeric(12, 2) not null default 0,
  overtime_rule public.overtime_rule_id not null default 'sa-film',
  ot_band1_hours numeric(6, 2) not null default 4,
  ot_band1_mult numeric(6, 3) not null default 1.5,
  ot_band2_mult numeric(6, 3) not null default 2,
  overtime_config jsonb not null default '{}'::jsonb,
  min_turnaround numeric(6, 2) not null default 10,
  turnaround_mode public.turnaround_mode not null default 'warning',
  turnaround_pen_mult numeric(6, 3) not null default 1.5,
  turnaround_config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint rate_presets_name_not_blank check (char_length(trim(name)) > 0),
  constraint rate_presets_type_not_blank check (char_length(trim(preset_type)) > 0),
  constraint rate_presets_money_nonnegative check (
    day_rate >= 0
    and equipment_rental >= 0
    and per_diem >= 0
  ),
  constraint rate_presets_hours_valid check (
    included_hours >= 0
    and ot_band1_hours >= 0
    and min_turnaround >= 0
  ),
  constraint rate_presets_multipliers_valid check (
    ot_band1_mult >= 0
    and ot_band2_mult >= 0
    and turnaround_pen_mult >= 0
  ),
  constraint rate_presets_json_objects check (
    jsonb_typeof(overtime_config) = 'object'
    and jsonb_typeof(turnaround_config) = 'object'
  )
);

create trigger set_rate_presets_updated_at
before update on public.rate_presets
for each row execute function public.set_updated_at();

create table public.day_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text,
  timesheet_entry_id uuid not null,
  description text not null default '',
  quantity numeric(12, 2) not null default 1,
  unit_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  vat_applicable boolean not null default true,
  category text not null default 'expense',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint day_expenses_entry_owner_fk foreign key (user_id, timesheet_entry_id) references public.timesheet_entries(user_id, id) on update cascade on delete cascade,
  constraint day_expenses_category_not_blank check (char_length(trim(category)) > 0),
  constraint day_expenses_amounts_nonnegative check (
    quantity >= 0
    and unit_amount >= 0
    and total_amount >= 0
  )
);

create trigger set_day_expenses_updated_at
before update on public.day_expenses
for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text,
  invoice_id uuid not null,
  payment_date date not null,
  amount numeric(12, 2) not null,
  method text not null default '',
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint payments_invoice_owner_fk foreign key (user_id, invoice_id) references public.invoices(user_id, id) on update cascade on delete restrict,
  constraint payments_amount_positive check (amount > 0)
);

create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_fingerprint text not null,
  source_app_version text,
  source_data_version integer,
  status public.import_batch_status not null default 'started',
  imported_counts jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, source_fingerprint),
  constraint import_batches_source_not_blank check (char_length(trim(source)) > 0),
  constraint import_batches_source_fingerprint_not_blank check (char_length(trim(source_fingerprint)) > 0),
  constraint import_batches_imported_counts_object check (jsonb_typeof(imported_counts) = 'object')
);

create trigger set_import_batches_updated_at
before update on public.import_batches
for each row execute function public.set_updated_at();

alter table public.timesheet_entries
  add column legacy_id text,
  add column overnight boolean not null default false,
  add column vat_rate numeric(5, 2) not null default 0,
  add column on_set_hours numeric(8, 2) not null default 0,
  add column meal_hours numeric(8, 2) not null default 0,
  add column travel_hours numeric(8, 2) not null default 0,
  add column paid_hours numeric(8, 2) not null default 0,
  add column overtime_hours numeric(8, 2) not null default 0,
  add column ot_band1_worked_hours numeric(8, 2) not null default 0,
  add column ot_band1_amount numeric(12, 2) not null default 0,
  add column ot_band2_worked_hours numeric(8, 2) not null default 0,
  add column ot_band2_amount numeric(12, 2) not null default 0,
  add column min_turnaround numeric(6, 2) not null default 10,
  add column turnaround_mode public.turnaround_mode not null default 'warning',
  add column turnaround_pen_mult numeric(6, 3) not null default 1.5,
  add column turnaround_hours numeric(8, 2) not null default 0,
  add column turnaround_penalty numeric(12, 2) not null default 0,
  add column day_subtotal numeric(12, 2) not null default 0,
  add column day_total numeric(12, 2) not null default 0,
  add column manual_override boolean not null default false,
  add constraint timesheet_entries_vat_rate_valid check (vat_rate between 0 and 100),
  add constraint timesheet_entries_turnaround_values_valid check (
    min_turnaround >= 0
    and turnaround_pen_mult >= 0
  ),
  add constraint timesheet_entries_calc_values_nonnegative check (
    on_set_hours >= 0
    and meal_hours >= 0
    and travel_hours >= 0
    and paid_hours >= 0
    and overtime_hours >= 0
    and ot_band1_worked_hours >= 0
    and ot_band1_amount >= 0
    and ot_band2_worked_hours >= 0
    and ot_band2_amount >= 0
    and turnaround_hours >= 0
    and turnaround_penalty >= 0
    and day_subtotal >= 0
    and day_total >= 0
  );

alter table public.invoice_lines
  add column legacy_id text,
  add column source_type public.invoice_line_source_type not null default 'manual',
  add column source_timesheet_entry_id uuid,
  add column source_day_expense_id uuid,
  add column unit_label text not null default '',
  add column is_manual boolean not null default true,
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint invoice_lines_metadata_object check (jsonb_typeof(metadata) = 'object'),
  add constraint invoice_lines_source_timesheet_entry_owner_fk foreign key (user_id, source_timesheet_entry_id) references public.timesheet_entries(user_id, id) on update cascade on delete restrict,
  add constraint invoice_lines_source_day_expense_owner_fk foreign key (user_id, source_day_expense_id) references public.day_expenses(user_id, id) on update cascade on delete restrict;

create index business_settings_user_id_idx on public.business_settings(user_id);
create index user_preferences_user_id_idx on public.user_preferences(user_id);
create index rate_presets_user_id_idx on public.rate_presets(user_id);
create unique index rate_presets_user_legacy_id_idx on public.rate_presets(user_id, legacy_id) where legacy_id is not null;
create unique index rate_presets_one_default_per_user_type_idx on public.rate_presets(user_id, preset_type) where is_default;
create index day_expenses_user_id_idx on public.day_expenses(user_id);
create index day_expenses_timesheet_entry_id_idx on public.day_expenses(user_id, timesheet_entry_id);
create unique index day_expenses_user_legacy_id_idx on public.day_expenses(user_id, legacy_id) where legacy_id is not null;
create index payments_user_id_idx on public.payments(user_id);
create index payments_invoice_id_idx on public.payments(user_id, invoice_id);
create unique index payments_user_legacy_id_idx on public.payments(user_id, legacy_id) where legacy_id is not null;
create index import_batches_user_id_idx on public.import_batches(user_id);
create index timesheet_entries_user_legacy_id_idx on public.timesheet_entries(user_id, legacy_id) where legacy_id is not null;
create index invoice_lines_user_legacy_id_idx on public.invoice_lines(user_id, legacy_id) where legacy_id is not null;
create index invoice_lines_source_timesheet_entry_id_idx on public.invoice_lines(user_id, source_timesheet_entry_id);
create index invoice_lines_source_day_expense_id_idx on public.invoice_lines(user_id, source_day_expense_id);

alter table public.business_settings enable row level security;
alter table public.user_preferences enable row level security;
alter table public.rate_presets enable row level security;
alter table public.day_expenses enable row level security;
alter table public.payments enable row level security;
alter table public.import_batches enable row level security;

create policy "Users can read own business settings"
on public.business_settings
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own business settings"
on public.business_settings
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own business settings"
on public.business_settings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own business settings"
on public.business_settings
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own user preferences"
on public.user_preferences
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own user preferences"
on public.user_preferences
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own user preferences"
on public.user_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own user preferences"
on public.user_preferences
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own rate presets"
on public.rate_presets
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own rate presets"
on public.rate_presets
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own rate presets"
on public.rate_presets
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own rate presets"
on public.rate_presets
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own day expenses"
on public.day_expenses
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own day expenses"
on public.day_expenses
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own day expenses"
on public.day_expenses
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own day expenses"
on public.day_expenses
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own payments"
on public.payments
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own payments"
on public.payments
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own payments"
on public.payments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own payments"
on public.payments
for delete
to authenticated
using (user_id = auth.uid());

create policy "Users can read own import batches"
on public.import_batches
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own import batches"
on public.import_batches
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own import batches"
on public.import_batches
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can delete own import batches"
on public.import_batches
for delete
to authenticated
using (user_id = auth.uid());

revoke all on table
  public.business_settings,
  public.user_preferences,
  public.rate_presets,
  public.day_expenses,
  public.payments,
  public.import_batches
from anon;

grant select, insert, update, delete on table
  public.business_settings,
  public.user_preferences,
  public.rate_presets,
  public.day_expenses,
  public.payments,
  public.import_batches
to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-logos',
  'business-logos',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
