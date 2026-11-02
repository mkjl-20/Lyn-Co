CREATE OR REPLACE FUNCTION public.set_waiting_queue_positions(p_queue_ids uuid[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_queue_ids uuid[] := p_queue_ids;
  v_total integer;
  v_offset bigint;
  v_max_position bigint;
  v_index integer;
BEGIN
  LOCK TABLE public.queue_entries IN SHARE ROW EXCLUSIVE MODE;

  IF v_queue_ids IS NULL THEN
    SELECT array_agg(id ORDER BY position NULLS LAST, created_at, id)
    INTO v_queue_ids
    FROM public.queue_entries
    WHERE status = 'waiting';
  END IF;

  v_total := COALESCE(array_length(v_queue_ids, 1), 0);
  IF v_total = 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(max(position), 0)
  INTO v_max_position
  FROM public.queue_entries
  WHERE status = 'waiting';
  v_offset := v_max_position + v_total + 1;

  UPDATE public.queue_entries
  SET position = position + v_offset
  WHERE status = 'waiting'
    AND position IS NOT NULL;

  FOR v_index IN 1..v_total LOOP
    UPDATE public.queue_entries
    SET position = v_index
    WHERE id = v_queue_ids[v_index]
      AND status = 'waiting';
  END LOOP;
END;
$$;

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
  LOCK TABLE public.queue_entries IN SHARE ROW EXCLUSIVE MODE;

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
      AND (
        status IN ('in_service', 'completed')
        OR service_started_at IS NOT NULL
        OR started_at IS NOT NULL
      )
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

  PERFORM public.set_waiting_queue_positions(NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_waiting_queue_entry_no_show(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_status text;
  v_now timestamptz := clock_timestamp();
BEGIN
  LOCK TABLE public.queue_entries IN SHARE ROW EXCLUSIVE MODE;

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
      AND (
        status IN ('in_service', 'completed')
        OR service_started_at IS NOT NULL
        OR started_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Only a waiting visit with no started services can be marked as a no-show.'
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
  SET status = 'no_show',
      position = NULL,
      waiting_seat_id = NULL,
      customer_service_seat_id = NULL,
      customer_seat_reserved_until = v_now
  WHERE id = p_entry_id;

  PERFORM public.set_waiting_queue_positions(NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_waiting_queue_entry(
  p_entry_id uuid,
  p_new_position integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_queue_ids uuid[];
  v_current_rank integer;
  v_total integer;
  v_target_rank integer;
BEGIN
  IF p_new_position IS NULL OR p_new_position < 1 THEN
    RAISE EXCEPTION 'Queue position must be at least one.'
      USING ERRCODE = '22023';
  END IF;

  LOCK TABLE public.queue_entries IN SHARE ROW EXCLUSIVE MODE;

  PERFORM 1
  FROM public.queue_entries
  WHERE status = 'waiting'
  ORDER BY id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.queue_entries
    WHERE id = p_entry_id
      AND status = 'waiting'
  ) THEN
    RAISE EXCEPTION 'Only a waiting queue entry can be reordered.'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queue_entry_services
    WHERE queue_entry_id = p_entry_id
      AND (
        status IN ('in_service', 'completed')
        OR service_started_at IS NOT NULL
        OR started_at IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'A visit cannot be reordered after a service has started.'
      USING ERRCODE = '23514';
  END IF;

  SELECT array_agg(id ORDER BY position NULLS LAST, created_at, id)
  INTO v_queue_ids
  FROM public.queue_entries
  WHERE status = 'waiting';

  v_total := COALESCE(array_length(v_queue_ids, 1), 0);
  v_current_rank := array_position(v_queue_ids, p_entry_id);
  IF v_current_rank IS NULL OR v_total = 0 THEN
    RAISE EXCEPTION 'Only a waiting queue entry can be reordered.'
      USING ERRCODE = 'P0002';
  END IF;

  v_target_rank := LEAST(p_new_position, v_total);
  IF v_target_rank < v_current_rank THEN
    v_queue_ids :=
      COALESCE(v_queue_ids[1:v_target_rank - 1], ARRAY[]::uuid[])
      || ARRAY[p_entry_id]
      || COALESCE(v_queue_ids[v_target_rank:v_current_rank - 1], ARRAY[]::uuid[])
      || COALESCE(v_queue_ids[v_current_rank + 1:v_total], ARRAY[]::uuid[]);
  ELSIF v_target_rank > v_current_rank THEN
    v_queue_ids :=
      COALESCE(v_queue_ids[1:v_current_rank - 1], ARRAY[]::uuid[])
      || COALESCE(v_queue_ids[v_current_rank + 1:v_target_rank], ARRAY[]::uuid[])
      || ARRAY[p_entry_id]
      || COALESCE(v_queue_ids[v_target_rank + 1:v_total], ARRAY[]::uuid[]);
  END IF;

  PERFORM public.set_waiting_queue_positions(v_queue_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.set_waiting_queue_positions(uuid[]) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.cancel_waiting_queue_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_waiting_queue_entry(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mark_waiting_queue_entry_no_show(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_waiting_queue_entry_no_show(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reorder_waiting_queue_entry(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_waiting_queue_entry(uuid, integer) TO service_role;
