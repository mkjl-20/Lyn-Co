-- LynQ hybrid forecasting engine (Moving Average + Linear Regression)
-- Computed in PostgreSQL as described in Chapter 3 / Table 3.8.

create table if not exists public.forecast_logs (
  id uuid primary key default gen_random_uuid(),
  method text not null default 'hybrid_ma_linear_regression',
  source text,
  slope numeric,
  intercept numeric,
  ewt_minutes numeric,
  waiting_count integer,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'sms',
  recipient text,
  milestone text,
  body text,
  status text not null default 'logged',
  created_at timestamptz not null default now()
);

alter table public.forecast_logs enable row level security;
alter table public.notifications enable row level security;

drop policy if exists forecast_logs_select_authenticated on public.forecast_logs;
create policy forecast_logs_select_authenticated
  on public.forecast_logs for select
  to authenticated
  using (true);

create or replace function public.compute_hybrid_forecast(p_window integer default 7)
returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
begin
  with hourly as (
    select
      date_trunc('hour', created_at) as bucket,
      extract(hour from created_at)::int as hour_of_day,
      count(*)::numeric as arrivals
    from public.queue_entries
    where created_at >= now() - interval '90 days'
      and status is distinct from 'cancelled'
    group by 1, 2
  ),
  ma as (
    select
      hour_of_day,
      avg(smoothed)::numeric as ma_volume
    from (
      select
        hour_of_day,
        avg(arrivals) over (
          partition by hour_of_day
          order by bucket
          rows between (greatest(p_window, 1) - 1) preceding and current row
        ) as smoothed
      from hourly
    ) t
    group by hour_of_day
  ),
  stats as (
    select
      count(*)::numeric as n,
      coalesce(sum(hour_of_day), 0)::numeric as sx,
      coalesce(sum(arrivals), 0)::numeric as sy,
      coalesce(sum(hour_of_day * arrivals), 0)::numeric as sxy,
      coalesce(sum(hour_of_day * hour_of_day), 0)::numeric as sxx
    from hourly
  ),
  coef as (
    select
      case
        when n < 2 or (n * sxx - sx * sx) = 0 then 0
        else (n * sxy - sx * sy) / (n * sxx - sx * sx)
      end as slope,
      case
        when n < 2 or (n * sxx - sx * sx) = 0 then coalesce((select avg(arrivals) from hourly), 0)
        else (sy / n) - ((n * sxy - sx * sy) / (n * sxx - sx * sx)) * (sx / n)
      end as intercept
    from stats
  ),
  waiting as (
    select
      coalesce(sum(estimated_duration), 0) as remaining_minutes,
      count(*) filter (where status = 'waiting') as waiting_count
    from public.queue_entries
    where status in ('waiting', 'in_service')
  ),
  staff as (
    select greatest(count(*), 1) as active_staff
    from public.profiles
    where account_role = 'staff' and is_active = true
  )
  select jsonb_build_object(
    'method', 'hybrid_ma_linear_regression',
    'hourly', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'hour', h.hour_of_day,
          'movingAverage', round(coalesce(m.ma_volume, 0)::numeric, 2),
          'linearRegression', round(greatest(c.intercept + c.slope * h.hour_of_day, 0)::numeric, 2),
          'hybrid', round((
            0.6 * coalesce(m.ma_volume, 0)
            + 0.4 * greatest(c.intercept + c.slope * h.hour_of_day, 0)
          )::numeric, 2)
        )
        order by h.hour_of_day
      ), '[]'::jsonb)
      from generate_series(9, 19) as h(hour_of_day)
      cross join coef c
      left join ma m on m.hour_of_day = h.hour_of_day
    ),
    'ewtMinutes', (
      select round((w.remaining_minutes / s.active_staff)::numeric, 1)
      from waiting w cross join staff s
    ),
    'waitingCount', (select waiting_count from waiting),
    'remainingMinutes', (select remaining_minutes from waiting),
    'activeStaff', (select active_staff from staff),
    'slope', (select round(slope::numeric, 4) from coef),
    'intercept', (select round(intercept::numeric, 4) from coef)
  )
  into result;

  return result;
end;
$$;

create or replace function public.estimate_entry_wait(p_entry_id uuid)
returns numeric
language plpgsql
stable
as $$
declare
  v_status text;
  v_position integer;
  v_ahead integer;
  v_ewt numeric;
begin
  select status, position
    into v_status, v_position
  from public.queue_entries
  where id = p_entry_id;

  if v_status is null then
    return null;
  end if;

  if v_status is distinct from 'waiting' or v_position is null then
    return 0;
  end if;

  select count(*)
    into v_ahead
  from public.queue_entries
  where status = 'waiting'
    and position < v_position;

  select (payload->>'ewtMinutes')::numeric
    into v_ewt
  from public.forecast_logs
  order by created_at desc
  limit 1;

  if v_ewt is null then
    v_ewt := (
      select coalesce(sum(estimated_duration), 0)
      from public.queue_entries
      where status in ('waiting', 'in_service')
    ) / greatest((
      select count(*) from public.profiles
      where account_role = 'staff' and is_active = true
    ), 1);
  end if;

  return round((coalesce(v_ahead, 0) * greatest(v_ewt / greatest((
    select count(*) from public.queue_entries where status = 'waiting'
  ), 1), 8))::numeric, 1);
end;
$$;

grant execute on function public.compute_hybrid_forecast(integer) to anon, authenticated, service_role;
grant execute on function public.estimate_entry_wait(uuid) to anon, authenticated, service_role;
