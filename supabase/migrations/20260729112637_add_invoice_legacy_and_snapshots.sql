alter table public.invoices
  add column legacy_id text null,
  add column source_timesheet_legacy_id text null,
  add column invoice_snapshot jsonb null;

create unique index invoices_user_legacy_id_unique
on public.invoices (user_id, legacy_id)
where legacy_id is not null;

create index invoices_user_source_timesheet_legacy_id_idx
on public.invoices (user_id, source_timesheet_legacy_id)
where source_timesheet_legacy_id is not null;

create unique index invoice_lines_user_legacy_id_unique
on public.invoice_lines (user_id, legacy_id)
where legacy_id is not null;

drop index public.invoice_lines_user_legacy_id_idx;
