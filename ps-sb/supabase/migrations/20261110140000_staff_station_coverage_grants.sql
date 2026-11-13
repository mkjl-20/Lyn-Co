CREATE TABLE IF NOT EXISTS public.staff_station_coverage_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT staff_station_coverage_grants_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS staff_station_coverage_grants_active_lookup_idx
  ON public.staff_station_coverage_grants (staff_id, station_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_station_coverage_grants_unique_active_idx
  ON public.staff_station_coverage_grants (staff_id, station_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.staff_station_coverage_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_station_coverage_grants FROM anon, authenticated;
GRANT SELECT ON TABLE public.staff_station_coverage_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_station_coverage_grants TO service_role;

DROP POLICY IF EXISTS staff_station_coverage_grants_read_own
  ON public.staff_station_coverage_grants;
CREATE POLICY staff_station_coverage_grants_read_own
  ON public.staff_station_coverage_grants
  FOR SELECT
  TO authenticated
  USING (staff_id = (SELECT auth.uid()));

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
  v_caller_role text;
  v_caller_staff_role text;
  v_caller_is_active boolean;
  v_target_role text;
  v_target_staff_role text;
  v_target_is_active boolean;
  v_station_owner_id uuid;
  v_station_is_active boolean;
  v_staff_is_authorized boolean;
BEGIN
  SELECT account_role::text, staff_role, is_active
  INTO v_caller_role, v_caller_staff_role, v_caller_is_active
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT COALESCE(v_caller_is_active, false)
    OR v_caller_role NOT IN ('admin', 'staff')
    OR (v_caller_role = 'staff' AND (auth.uid() <> p_staff_id OR v_caller_staff_role = 'receptionist')) THEN
    RAISE EXCEPTION 'Not authorized to start service.'
      USING ERRCODE = '42501';
  END IF;

  SELECT account_role::text, staff_role, is_active
  INTO v_target_role, v_target_staff_role, v_target_is_active
  FROM public.profiles
  WHERE id = p_staff_id;

  IF NOT COALESCE(v_target_is_active, false)
    OR v_target_staff_role = 'receptionist'
    OR (v_target_role <> 'staff' AND NOT (v_target_role = 'admin' AND v_target_staff_role = 'hairstylist')) THEN
    RAISE EXCEPTION 'The selected staff member is not eligible to start services.'
      USING ERRCODE = '42501';
  END IF;

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

  SELECT home_staff_id, is_active
  INTO v_station_owner_id, v_station_is_active
  FROM public.stations
  WHERE id = p_station_id
  FOR UPDATE;

  IF NOT FOUND OR NOT COALESCE(v_station_is_active, false) THEN
    RAISE EXCEPTION 'The selected station is not active.'
      USING ERRCODE = '23514';
  END IF;

  v_staff_is_authorized := v_station_owner_id = p_staff_id
    OR EXISTS (
      SELECT 1
      FROM public.staff_station_coverage_grants
      WHERE station_id = p_station_id
        AND staff_id = p_staff_id
        AND revoked_at IS NULL
        AND expires_at > clock_timestamp()
    );

  IF NOT COALESCE(v_staff_is_authorized, false) THEN
    RAISE EXCEPTION 'Staff member is not scheduled or approved to cover this station.'
      USING ERRCODE = '42501';
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
      AND occupied.queue_entry_id <> v_entry_id
      AND occupied.status IN ('pending', 'in_service')
      AND (
        occupied.status = 'in_service'
        OR (
          occupied.customer_seat_reserved_until IS NOT NULL
          AND occupied.customer_seat_reserved_until > clock_timestamp()
        )
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
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_service_item_with_customer_seat(uuid, uuid, uuid, uuid)
  TO authenticated, service_role;
