ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS promotion_id uuid
    REFERENCES public.promotions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS queue_entries_promotion_id_idx
  ON public.queue_entries (promotion_id)
  WHERE promotion_id IS NOT NULL;
