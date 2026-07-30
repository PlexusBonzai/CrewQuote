alter table public.timesheets
  add column legacy_id text null;

create unique index timesheets_user_legacy_id_unique
on public.timesheets (user_id, legacy_id)
where legacy_id is not null;
