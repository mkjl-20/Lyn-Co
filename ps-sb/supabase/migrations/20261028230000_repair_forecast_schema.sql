CREATE TABLE IF NOT EXISTS public.forecast_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date date NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  event_type text NOT NULL CHECK (event_type IN ('holiday', 'promotion', 'custom')),
  demand_multiplier numeric(4, 2) NOT NULL DEFAULT 1.00 CHECK (demand_multiplier BETWEEN 0.10 AND 5.00),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forecast_events_event_date_idx
  ON public.forecast_events (event_date);

ALTER TABLE public.forecast_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.forecast_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  method text NOT NULL DEFAULT 'hybrid_ma_linear_regression',
  source text,
  slope numeric,
  intercept numeric,
  ewt_minutes numeric,
  waiting_count integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_logs
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'hybrid_ma_linear_regression',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS slope numeric,
  ADD COLUMN IF NOT EXISTS intercept numeric,
  ADD COLUMN IF NOT EXISTS ewt_minutes numeric,
  ADD COLUMN IF NOT EXISTS waiting_count integer,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.forecast_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON TABLE public.forecast_logs TO service_role;
GRANT ALL ON TABLE public.forecast_events TO service_role;
