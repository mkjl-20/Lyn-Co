CREATE TABLE IF NOT EXISTS public.staff_availability (
  staff_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'on_break')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.staff_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_availability FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_availability TO service_role;

CREATE TABLE IF NOT EXISTS public.queue_sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id uuid NOT NULL REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  milestone text NOT NULL CHECK (milestone IN ('joined', 'almost_your_turn', 'your_turn')),
  recipient text NOT NULL,
  customer_name text NOT NULL,
  extra text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (queue_entry_id, milestone)
);

CREATE INDEX IF NOT EXISTS queue_sms_outbox_pending_idx
  ON public.queue_sms_outbox (created_at)
  WHERE status = 'pending';

ALTER TABLE public.queue_sms_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.queue_sms_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.queue_sms_outbox TO service_role;
