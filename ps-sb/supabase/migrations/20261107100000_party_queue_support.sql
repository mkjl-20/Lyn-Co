CREATE TABLE IF NOT EXISTS public.queue_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_number text,
  member_count smallint NOT NULL CHECK (member_count BETWEEN 2 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_parties_contact_number_format
    CHECK (contact_number IS NULL OR contact_number ~ '^09[0-9]{9}$')
);

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS party_id uuid
    REFERENCES public.queue_parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS queue_entries_party_id_idx
  ON public.queue_entries (party_id)
  WHERE party_id IS NOT NULL;

ALTER TABLE public.queue_parties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.queue_parties FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queue_parties TO service_role;
