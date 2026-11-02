ALTER TABLE public.queue_sms_outbox
  ADD COLUMN IF NOT EXISTS event_key uuid;

ALTER TABLE public.queue_sms_outbox
  DROP CONSTRAINT IF EXISTS queue_sms_outbox_queue_entry_id_milestone_key;

ALTER TABLE public.queue_sms_outbox
  DROP CONSTRAINT IF EXISTS queue_sms_outbox_milestone_check;

ALTER TABLE public.queue_sms_outbox
  ADD CONSTRAINT queue_sms_outbox_milestone_check
  CHECK (milestone IN ('joined', 'almost_your_turn', 'your_turn', 'admin_reordered', 'staff_reassigned'));

CREATE UNIQUE INDEX IF NOT EXISTS queue_sms_outbox_milestone_once_idx
  ON public.queue_sms_outbox (queue_entry_id, milestone)
  WHERE event_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS queue_sms_outbox_event_once_idx
  ON public.queue_sms_outbox (queue_entry_id, milestone, event_key)
  WHERE event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.staff_rebalance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_item_id uuid NOT NULL REFERENCES public.queue_entry_services(id) ON DELETE CASCADE,
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  from_staff_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_staff_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_rebalance_requests_one_pending_idx
  ON public.staff_rebalance_requests (service_item_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS staff_rebalance_requests_staff_pending_idx
  ON public.staff_rebalance_requests (to_staff_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.staff_rebalance_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_rebalance_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_rebalance_requests TO service_role;

CREATE OR REPLACE FUNCTION public.set_staff_availability_and_reassign_queue(
  p_staff_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_staff_role text;
  v_item record;
  v_target_id uuid;
  v_reassignments jsonb := '[]'::jsonb;
BEGIN
  IF p_status NOT IN ('available', 'on_break') THEN
    RAISE EXCEPTION 'Choose available or on break.' USING ERRCODE = '22023';
  END IF;

  SELECT staff_role::text
  INTO v_staff_role
  FROM public.profiles
  WHERE id = p_staff_id
    AND account_role IN ('staff', 'admin')
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active staff account is required.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.staff_availability (staff_id, status, updated_at, updated_by)
  VALUES (p_staff_id, p_status, clock_timestamp(), p_staff_id)
  ON CONFLICT (staff_id) DO UPDATE
  SET status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  IF p_status <> 'on_break' THEN
    RETURN jsonb_build_object('status', p_status, 'reassignments', v_reassignments);
  END IF;

  FOR v_item IN
    SELECT service_item.id AS service_item_id,
           service_item.queue_entry_id,
           service_item.assigned_staff_id,
           service_item.preferred_staff_id,
           service.category::text AS category,
           entry.ticket_number,
           entry.customer_name,
           entry.contact_number
    FROM public.queue_entry_services AS service_item
    JOIN public.queue_entries AS entry ON entry.id = service_item.queue_entry_id
    JOIN public.services AS service ON service.id = service_item.service_id
    WHERE entry.status = 'waiting'
      AND service_item.status = 'pending'
      AND (
        service_item.assigned_staff_id = p_staff_id
        OR (service_item.assigned_staff_id IS NULL AND entry.assigned_staff_id = p_staff_id)
      )
    ORDER BY entry.position NULLS LAST, service_item.id
    FOR UPDATE OF service_item, entry SKIP LOCKED
  LOOP
    SELECT candidate.id
    INTO v_target_id
    FROM public.profiles AS candidate
    LEFT JOIN public.staff_availability AS availability
      ON availability.staff_id = candidate.id
    WHERE candidate.id <> p_staff_id
      AND candidate.account_role = 'staff'
      AND candidate.is_active = true
      AND COALESCE(availability.status, 'available') = 'available'
      AND (
        (v_item.category ~* '(hair|rebond|hairstyl|make[ _-]?up|brows?|eyebrows?|lash)'
          AND candidate.staff_role::text = 'hairstylist')
        OR (v_item.category ~* '(nail|mani|pedi|foot)'
          AND candidate.staff_role::text IN ('nail_technician', 'manicurist', 'pedicurist'))
        OR EXISTS (
          SELECT 1
          FROM public.stations AS station
          WHERE station.home_staff_id = candidate.id
            AND station.is_active = true
            AND (
              lower(station.category) = lower(v_item.category)
              OR (
                v_item.category ~* '(hair|rebond|hairstyl|make[ _-]?up|brows?|eyebrows?|lash)'
                AND station.category ~* '(hair|rebond|hairstyl|make[ _-]?up|brows?|eyebrows?|lash)'
              )
              OR (
                v_item.category ~* '(nail|mani|pedi|foot)'
                AND station.category ~* '(nail|mani|pedi|foot)'
              )
            )
        )
      )
    ORDER BY (
      SELECT count(*)
      FROM public.queue_entry_services AS workload_item
      JOIN public.queue_entries AS workload_entry ON workload_entry.id = workload_item.queue_entry_id
      WHERE workload_item.assigned_staff_id = candidate.id
        AND workload_item.status IN ('pending', 'in_service')
        AND workload_entry.status IN ('waiting', 'in_service')
    ), candidate.id
    LIMIT 1;

    UPDATE public.queue_entry_services
    SET assigned_staff_id = v_target_id
    WHERE id = v_item.service_item_id
      AND status = 'pending';

    UPDATE public.queue_entries
    SET assigned_staff_id = NULL
    WHERE id = v_item.queue_entry_id
      AND assigned_staff_id = p_staff_id;

    v_reassignments := v_reassignments || jsonb_build_array(jsonb_build_object(
      'serviceItemId', v_item.service_item_id,
      'entryId', v_item.queue_entry_id,
      'ticketNumber', v_item.ticket_number,
      'customerName', v_item.customer_name,
      'contactNumber', v_item.contact_number,
      'category', v_item.category,
      'fromStaffId', p_staff_id,
      'toStaffId', v_target_id
    ));
  END LOOP;

  UPDATE public.staff_rebalance_requests
  SET status = 'cancelled',
      responded_at = clock_timestamp()
  WHERE from_staff_id = p_staff_id
    AND status = 'pending';

  RETURN jsonb_build_object('status', p_status, 'reassignments', v_reassignments);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_staff_rebalance_request(
  p_request_id uuid,
  p_staff_id uuid,
  p_response text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_request public.staff_rebalance_requests%ROWTYPE;
  v_category text;
  v_availability text;
BEGIN
  IF p_response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Choose accept or decline.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_request
  FROM public.staff_rebalance_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rebalance request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_request.to_staff_id <> p_staff_id THEN
    RAISE EXCEPTION 'This rebalance request is assigned to another staff member.' USING ERRCODE = '42501';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'This rebalance request has already been resolved.' USING ERRCODE = '23514';
  END IF;

  IF p_response = 'accepted' THEN
    SELECT service.category::text, COALESCE(availability.status, 'available')
    INTO v_category, v_availability
    FROM public.queue_entry_services AS service_item
    JOIN public.services AS service ON service.id = service_item.service_id
    JOIN public.queue_entries AS entry ON entry.id = service_item.queue_entry_id
    JOIN public.profiles AS staff
      ON staff.id = p_staff_id
     AND staff.account_role = 'staff'
     AND staff.is_active = true
    LEFT JOIN public.staff_availability AS availability ON availability.staff_id = staff.id
    WHERE service_item.id = v_request.service_item_id
      AND service_item.queue_entry_id = v_request.queue_entry_id
      AND service_item.status = 'pending'
      AND service_item.assigned_staff_id IS NOT DISTINCT FROM v_request.from_staff_id
      AND entry.status = 'waiting'
    FOR UPDATE OF service_item, entry;

    IF NOT FOUND OR v_availability <> 'available' THEN
      RAISE EXCEPTION 'The service or your availability changed. Refresh the queue before accepting.' USING ERRCODE = '23514';
    END IF;

    IF NOT (
      (v_category ~* '(hair|rebond|hairstyl|make[ _-]?up|brows?|eyebrows?|lash)'
        AND (SELECT staff_role::text FROM public.profiles WHERE id = p_staff_id) = 'hairstylist')
      OR (v_category ~* '(nail|mani|pedi|foot)'
        AND (SELECT staff_role::text FROM public.profiles WHERE id = p_staff_id) IN ('nail_technician', 'manicurist', 'pedicurist'))
      OR EXISTS (
        SELECT 1 FROM public.stations AS station
        WHERE station.home_staff_id = p_staff_id
          AND station.is_active = true
          AND (
            lower(station.category) = lower(v_category)
            OR (v_category ~* '(hair|rebond|hairstyl|make[ _-]?up|brows?|eyebrows?|lash)'
              AND station.category ~* '(hair|rebond|hairstyl|make[ _-]?up|brows?|eyebrows?|lash)')
            OR (v_category ~* '(nail|mani|pedi|foot)'
              AND station.category ~* '(nail|mani|pedi|foot)')
          )
      )
    ) THEN
      RAISE EXCEPTION 'You are not eligible to perform this service.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.queue_entry_services
    SET assigned_staff_id = p_staff_id
    WHERE id = v_request.service_item_id
      AND status = 'pending'
      AND assigned_staff_id IS NOT DISTINCT FROM v_request.from_staff_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The service changed before the request was accepted.' USING ERRCODE = '40001';
    END IF;
  END IF;

  UPDATE public.staff_rebalance_requests
  SET status = p_response,
      responded_at = clock_timestamp()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'id', v_request.id,
    'entryId', v_request.queue_entry_id,
    'serviceItemId', v_request.service_item_id,
    'fromStaffId', v_request.from_staff_id,
    'toStaffId', v_request.to_staff_id,
    'status', p_response
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_availability_and_reassign_queue(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_to_staff_rebalance_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_availability_and_reassign_queue(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_to_staff_rebalance_request(uuid, uuid, text) TO service_role;
