alter table public.timesheets
  add column summary_day_count integer not null default 0,
  add column summary_paid_hours numeric(8, 2) not null default 0,
  add column summary_overtime_hours numeric(8, 2) not null default 0,
  add column summary_travel_hours numeric(8, 2) not null default 0,
  add column summary_day_rate_total numeric(14, 2) not null default 0,
  add column summary_overtime_total numeric(14, 2) not null default 0,
  add column summary_equipment_total numeric(14, 2) not null default 0,
  add column summary_per_diem_total numeric(14, 2) not null default 0,
  add column summary_expense_total numeric(14, 2) not null default 0,
  add column summary_turnaround_penalty_total numeric(14, 2) not null default 0,
  add column summary_subtotal numeric(14, 2) not null default 0,
  add column summary_vat_rate numeric(7, 4) not null default 0,
  add column summary_mixed_vat boolean not null default false,
  add column summary_vat_amount numeric(14, 2) not null default 0,
  add column summary_grand_total numeric(14, 2) not null default 0,
  add column summary_snapshot jsonb not null default '{}'::jsonb,
  add constraint timesheets_summary_values_nonnegative check (
    summary_day_count >= 0
    and summary_paid_hours >= 0
    and summary_overtime_hours >= 0
    and summary_travel_hours >= 0
    and summary_day_rate_total >= 0
    and summary_overtime_total >= 0
    and summary_equipment_total >= 0
    and summary_per_diem_total >= 0
    and summary_expense_total >= 0
    and summary_turnaround_penalty_total >= 0
    and summary_subtotal >= 0
    and summary_vat_rate >= 0
    and summary_vat_amount >= 0
    and summary_grand_total >= 0
  ),
  add constraint timesheets_summary_snapshot_object check (
    jsonb_typeof(summary_snapshot) = 'object'
  );
