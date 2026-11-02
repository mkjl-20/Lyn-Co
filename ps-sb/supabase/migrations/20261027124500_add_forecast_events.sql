create table if not exists public.forecast_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  event_type text not null check (event_type in ('holiday', 'promotion', 'custom')),
  demand_multiplier numeric(4, 2) not null default 1.00 check (demand_multiplier between 0.10 and 5.00),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists forecast_events_event_date_idx
  on public.forecast_events (event_date);

alter table public.forecast_events enable row level security;
