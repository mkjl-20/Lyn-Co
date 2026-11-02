ALTER TABLE public.queue_entry_services
  ADD COLUMN IF NOT EXISTS preferred_staff_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS queue_entry_services_preferred_staff_idx
  ON public.queue_entry_services (preferred_staff_id, status)
  WHERE preferred_staff_id IS NOT NULL;
