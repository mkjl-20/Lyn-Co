CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
  ON public.audit_logs (created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO service_role;

CREATE INDEX IF NOT EXISTS pos_transactions_paid_created_at_idx
  ON public.pos_transactions (created_at)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS queue_entries_created_at_idx
  ON public.queue_entries (created_at);
