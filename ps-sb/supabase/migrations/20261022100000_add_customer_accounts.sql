CREATE TABLE IF NOT EXISTS public.customer_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 100),
  contact_number text NOT NULL CHECK (contact_number ~ '^09[0-9]{9}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS customer_account_id uuid
    REFERENCES public.customer_accounts(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS queue_entries_customer_account_id_idx
  ON public.queue_entries (customer_account_id, created_at DESC)
  WHERE customer_account_id IS NOT NULL;

ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_accounts TO service_role;
