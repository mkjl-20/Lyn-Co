CREATE OR REPLACE FUNCTION public.assign_waiting_seat(p_entry_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_status text;
  v_waiting_seat_id uuid;
  v_seat_id uuid;
  v_seat_label text;
BEGIN
  SELECT status::text, waiting_seat_id
  INTO v_entry_status, v_waiting_seat_id
  FROM public.queue_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry % was not found.', p_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_entry_status NOT IN ('waiting', 'in_service') THEN
    RAISE EXCEPTION 'A lounge seat can only be assigned to an active queue entry.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queue_entry_services
    WHERE queue_entry_id = p_entry_id
      AND status = 'in_service'
  ) THEN
    RAISE EXCEPTION 'A lounge seat cannot be assigned while a service is in progress.'
      USING ERRCODE = '23514';
  END IF;

  IF v_waiting_seat_id IS NOT NULL THEN
    SELECT label
    INTO v_seat_label
    FROM public.waiting_seats
    WHERE id = v_waiting_seat_id;

    RETURN v_seat_label;
  END IF;

  SELECT seat.id, seat.label
  INTO v_seat_id, v_seat_label
  FROM public.waiting_seats AS seat
  WHERE seat.is_active
    AND NOT EXISTS (
      SELECT 1
      FROM public.queue_entries AS occupied
      WHERE occupied.waiting_seat_id = seat.id
        AND occupied.status IN ('waiting', 'in_service')
    )
  ORDER BY seat.label, seat.id
  LIMIT 1
  FOR UPDATE OF seat SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.queue_entries
  SET waiting_seat_id = v_seat_id
  WHERE id = p_entry_id
    AND status = 'waiting'
    AND waiting_seat_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry % changed while assigning a lounge seat.', p_entry_id
      USING ERRCODE = '40001';
  END IF;

  RETURN v_seat_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_service_item_and_update_entry(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
  v_locked_entry_id uuid;
  v_item_status text;
  v_entry_status text;
  v_completed_at timestamptz := clock_timestamp();
BEGIN
  SELECT queue_entry_id
  INTO v_entry_id
  FROM public.queue_entry_services
  WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service item % was not found.', p_item_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT status::text
  INTO v_entry_status
  FROM public.queue_entries
  WHERE id = v_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry % was not found for service item %.', v_entry_id, p_item_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT queue_entry_id, status::text
  INTO v_locked_entry_id, v_item_status
  FROM public.queue_entry_services
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service item % was not found while completing.', p_item_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_locked_entry_id <> v_entry_id THEN
    RAISE EXCEPTION 'Service item % changed while completing.', p_item_id
      USING ERRCODE = '40001';
  END IF;

  IF v_item_status <> 'in_service' THEN
    RAISE EXCEPTION 'Only an in-progress service can be completed.'
      USING ERRCODE = '23514';
  END IF;

  IF v_entry_status IN ('cancelled', 'no_show', 'completed') THEN
    RAISE EXCEPTION 'A service cannot be completed for a closed queue entry.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.queue_entry_services
  SET status = 'completed',
      service_stage = 'completed',
      completed_at = v_completed_at,
      station_reserved_until = v_completed_at,
      customer_seat_reserved_until = v_completed_at
  WHERE id = p_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.queue_entry_services AS service_item
    WHERE service_item.queue_entry_id = v_entry_id
      AND service_item.status NOT IN ('completed', 'cancelled')
  ) THEN
    UPDATE public.queue_entries
    SET status = 'completed',
        started_at = COALESCE(started_at, v_completed_at),
        completed_at = v_completed_at,
        waiting_seat_id = NULL
    WHERE id = v_entry_id;
  ELSE
    UPDATE public.queue_entries
    SET status = 'in_service',
        started_at = COALESCE(started_at, v_completed_at),
        completed_at = NULL,
        waiting_seat_id = NULL
    WHERE id = v_entry_id;
  END IF;
END;
$$;

ALTER TABLE public.queue_entry_services
  ADD COLUMN IF NOT EXISTS station_queue_position integer;

WITH station_entries AS (
  SELECT DISTINCT ON (service_item.station_id, service_item.queue_entry_id)
    service_item.station_id,
    service_item.queue_entry_id,
    entry.position,
    entry.created_at
  FROM public.queue_entry_services AS service_item
  JOIN public.queue_entries AS entry ON entry.id = service_item.queue_entry_id
  WHERE service_item.station_id IS NOT NULL
    AND service_item.status = 'pending'
    AND entry.status = 'waiting'
  ORDER BY service_item.station_id, service_item.queue_entry_id, service_item.id
),
ranked_station_entries AS (
  SELECT
    station_id,
    queue_entry_id,
    row_number() OVER (
      PARTITION BY station_id
      ORDER BY position NULLS LAST, created_at, queue_entry_id
    )::integer AS station_queue_position
  FROM station_entries
)
UPDATE public.queue_entry_services AS service_item
SET station_queue_position = ranked.station_queue_position
FROM ranked_station_entries AS ranked
WHERE service_item.station_id = ranked.station_id
  AND service_item.queue_entry_id = ranked.queue_entry_id
  AND service_item.status = 'pending';

CREATE OR REPLACE FUNCTION public.cancel_waiting_queue_entry(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_status text;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT status::text
  INTO v_entry_status
  FROM public.queue_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry % was not found.', p_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_entry_status <> 'waiting' OR EXISTS (
    SELECT 1
    FROM public.queue_entry_services
    WHERE queue_entry_id = p_entry_id
      AND status IN ('in_service', 'completed')
  ) THEN
    RAISE EXCEPTION 'Only a waiting visit with no started services can be cancelled.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.queue_entry_services
  SET status = 'cancelled',
      service_stage = 'cancelled',
      station_reserved_until = v_now,
      customer_seat_reserved_until = v_now,
      customer_service_seat_id = NULL,
      station_id = NULL,
      station_queue_position = NULL
  WHERE queue_entry_id = p_entry_id
    AND status = 'pending';

  UPDATE public.queue_entries
  SET status = 'cancelled',
      position = NULL,
      waiting_seat_id = NULL,
      customer_service_seat_id = NULL,
      customer_seat_reserved_until = v_now
  WHERE id = p_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_pending_queue_service(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
  v_entry_status text;
  v_item_status text;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT queue_entry_id
  INTO v_entry_id
  FROM public.queue_entry_services
  WHERE id = p_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service item % was not found.', p_item_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT status::text
  INTO v_entry_status
  FROM public.queue_entries
  WHERE id = v_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry % was not found.', v_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT status::text
  INTO v_item_status
  FROM public.queue_entry_services
  WHERE id = p_item_id
    AND queue_entry_id = v_entry_id
  FOR UPDATE;

  IF NOT FOUND OR v_entry_status <> 'waiting' OR v_item_status <> 'pending'
    OR EXISTS (
      SELECT 1
      FROM public.queue_entry_services
      WHERE queue_entry_id = v_entry_id
        AND status IN ('in_service', 'completed')
    ) THEN
    RAISE EXCEPTION 'Only a pending service on a visit that has not started can be cancelled.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.queue_entry_services
  SET status = 'cancelled',
      service_stage = 'cancelled',
      station_reserved_until = v_now,
      customer_seat_reserved_until = v_now,
      customer_service_seat_id = NULL,
      station_id = NULL,
      station_queue_position = NULL
  WHERE id = p_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.queue_entry_services
    WHERE queue_entry_id = v_entry_id
      AND status = 'pending'
  ) THEN
    UPDATE public.queue_entries
    SET status = 'cancelled',
        position = NULL,
        waiting_seat_id = NULL,
        customer_service_seat_id = NULL,
        customer_seat_reserved_until = v_now
    WHERE id = v_entry_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_station_queue_entries(
  p_station_id uuid,
  p_first_entry_id uuid,
  p_second_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_first_position integer;
  v_second_position integer;
  v_waiting_entry_count integer;
BEGIN
  IF p_first_entry_id = p_second_entry_id THEN
    RAISE EXCEPTION 'Choose two different queue entries.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.queue_entries
  WHERE id IN (p_first_entry_id, p_second_entry_id)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*)
  INTO v_waiting_entry_count
  FROM public.queue_entries
  WHERE id IN (p_first_entry_id, p_second_entry_id)
    AND status = 'waiting';

  IF v_waiting_entry_count <> 2 THEN
    RAISE EXCEPTION 'Only two waiting queue entries can be swapped.'
      USING ERRCODE = '23514';
  END IF;

  SELECT min(service_item.station_queue_position)
  INTO v_first_position
  FROM public.queue_entry_services AS service_item
  WHERE service_item.queue_entry_id = p_first_entry_id
    AND service_item.station_id = p_station_id
    AND service_item.status = 'pending';

  IF v_first_position IS NULL THEN
    SELECT entry.position
    INTO v_first_position
    FROM public.queue_entries AS entry
    WHERE entry.id = p_first_entry_id;
  END IF;

  SELECT min(service_item.station_queue_position)
  INTO v_second_position
  FROM public.queue_entry_services AS service_item
  WHERE service_item.queue_entry_id = p_second_entry_id
    AND service_item.station_id = p_station_id
    AND service_item.status = 'pending';

  IF v_second_position IS NULL THEN
    SELECT entry.position
    INTO v_second_position
    FROM public.queue_entries AS entry
    WHERE entry.id = p_second_entry_id;
  END IF;

  IF v_first_position IS NULL OR v_second_position IS NULL THEN
    RAISE EXCEPTION 'Both customers must be waiting for the selected station.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.queue_entry_services
  SET station_queue_position = NULL
  WHERE station_id = p_station_id
    AND status = 'pending'
    AND queue_entry_id IN (p_first_entry_id, p_second_entry_id);

  UPDATE public.queue_entry_services
  SET station_queue_position = v_second_position
  WHERE station_id = p_station_id
    AND status = 'pending'
    AND queue_entry_id = p_first_entry_id;

  UPDATE public.queue_entry_services
  SET station_queue_position = v_first_position
  WHERE station_id = p_station_id
    AND status = 'pending'
    AND queue_entry_id = p_second_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_waiting_seat(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_waiting_seat(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_service_item_and_update_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_service_item_and_update_entry(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_waiting_queue_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_waiting_queue_entry(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_pending_queue_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_pending_queue_service(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.swap_station_queue_entries(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.swap_station_queue_entries(uuid, uuid, uuid) TO service_role;
