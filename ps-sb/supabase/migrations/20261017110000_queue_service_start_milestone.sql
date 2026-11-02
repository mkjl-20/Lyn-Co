ALTER TABLE public.queue_entry_services
  ADD COLUMN IF NOT EXISTS service_started_at timestamptz;

UPDATE public.queue_entry_services
SET service_started_at = COALESCE(started_at, completed_at, now())
WHERE (status = 'completed'
  OR (status = 'in_service' AND COALESCE(service_stage, '') <> 'called'))
  AND service_started_at IS NULL;
