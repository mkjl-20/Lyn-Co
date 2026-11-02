CREATE OR REPLACE FUNCTION public.start_service_item_and_release_lounge_seat(
  p_item_id uuid,
  p_station_id uuid,
  p_staff_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  SELECT queue_entry_id
  INTO v_entry_id
  FROM public.queue_entry_services
  WHERE id = p_item_id;

  IF v_entry_id IS NULL THEN
    RAISE EXCEPTION 'Service item not found.';
  END IF;

  PERFORM 1
  FROM public.queue_entries
  WHERE id = v_entry_id
  FOR UPDATE;

  PERFORM public.start_service_item(p_item_id, p_station_id, p_staff_id);

  UPDATE public.queue_entries
  SET waiting_seat_id = NULL
  WHERE id = v_entry_id;
END;
$$;
