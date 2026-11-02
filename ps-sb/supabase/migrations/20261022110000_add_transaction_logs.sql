CREATE TABLE IF NOT EXISTS public.transaction_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transaction_logs_created_at_idx
  ON public.transaction_logs (created_at DESC);

ALTER TABLE public.transaction_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transaction_logs FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.transaction_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.transaction_logs_id_seq TO service_role;
