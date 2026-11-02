CREATE OR REPLACE FUNCTION public.start_service_item_with_customer_seat(
  p_item_id uuid,
  p_station_id uuid,
  p_staff_id uuid,
  p_customer_service_seat_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
  v_item_status text;
  v_seat_id uuid;
BEGIN
  SELECT queue_entry_id, status::text
  INTO v_entry_id, v_item_status
  FROM public.queue_entry_services
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service item % was not found.', p_item_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_item_status <> 'pending' THEN
    RAISE EXCEPTION 'Only a waiting service can be started.'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.queue_entries
  WHERE id = v_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Queue entry % was not found.', v_entry_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT id
  INTO v_seat_id
  FROM public.customer_service_seats
  WHERE id = p_customer_service_seat_id
    AND is_active
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected service seat is not active.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.queue_entry_services AS occupied
    WHERE occupied.customer_service_seat_id = v_seat_id
      AND occupied.id <> p_item_id
      AND occupied.status IN ('pending', 'in_service')
      AND (
        occupied.customer_seat_reserved_until IS NULL
        OR occupied.customer_seat_reserved_until > clock_timestamp()
      )
  ) THEN
    RAISE EXCEPTION 'The selected service seat is already reserved.'
      USING ERRCODE = '23505';
  END IF;

  PERFORM public.start_service_item_and_release_lounge_seat(
    p_item_id,
    p_station_id,
    p_staff_id
  );

  UPDATE public.queue_entry_services
  SET customer_service_seat_id = v_seat_id,
      customer_seat_reserved_until = NULL
  WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_service_item_with_customer_seat(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_service_item_with_customer_seat(uuid, uuid, uuid, uuid)
  TO service_role;
