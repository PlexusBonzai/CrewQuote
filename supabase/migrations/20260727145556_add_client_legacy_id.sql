alter table public.clients
  add column legacy_id text;

create unique index clients_user_legacy_id_unique
on public.clients (user_id, legacy_id)
where legacy_id is not null;
