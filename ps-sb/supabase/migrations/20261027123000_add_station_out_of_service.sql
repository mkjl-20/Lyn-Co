alter table public.stations
  add column if not exists is_out_of_service boolean not null default false,
  add column if not exists out_of_service_reason text,
  add column if not exists was_active_before_out_of_service boolean not null default true;

alter table public.stations
  drop constraint if exists stations_out_of_service_reason_check;

alter table public.stations
  add constraint stations_out_of_service_reason_check
  check (
    (is_out_of_service and nullif(btrim(out_of_service_reason), '') is not null)
    or (not is_out_of_service and out_of_service_reason is null)
  );
