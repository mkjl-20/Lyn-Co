ALTER TABLE public.customer_service_seats
  ADD COLUMN IF NOT EXISTS manual_status text;

UPDATE public.customer_service_seats
SET manual_status = CASE WHEN is_active THEN 'available' ELSE 'unavailable' END
WHERE manual_status IS NULL;

ALTER TABLE public.customer_service_seats
  ALTER COLUMN manual_status SET DEFAULT 'available',
  ALTER COLUMN manual_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_service_seats_manual_status_check'
      AND conrelid = 'public.customer_service_seats'::regclass
  ) THEN
    ALTER TABLE public.customer_service_seats
      ADD CONSTRAINT customer_service_seats_manual_status_check
      CHECK (manual_status IN ('available', 'reserved', 'unavailable'));
  END IF;
END;
$$;
