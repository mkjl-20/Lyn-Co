CREATE TABLE IF NOT EXISTS public.service_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_date date NOT NULL,
  service_category text NOT NULL,
  service text NOT NULL,
  staff_name text NOT NULL,
  seat_no integer,
  staff_experience integer NOT NULL DEFAULT 2,
  customer_group text,
  customer_type text,
  stylist_request boolean NOT NULL DEFAULT false,
  add_on boolean NOT NULL DEFAULT false,
  queue_length integer NOT NULL DEFAULT 0,
  arrival_rate_per_hr integer NOT NULL DEFAULT 0,
  station_prep_min numeric NOT NULL DEFAULT 0,
  hour_of_day integer,
  holiday boolean NOT NULL DEFAULT false,
  payday boolean NOT NULL DEFAULT false,
  arrived_at timestamptz,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  waiting_min numeric NOT NULL,
  duration_min numeric NOT NULL,
  source text NOT NULL DEFAULT 'imported',
  record_hash text
);

ALTER TABLE public.service_history
  ADD COLUMN IF NOT EXISTS record_hash text;

UPDATE public.service_history
SET record_hash = md5(ctid::text || clock_timestamp()::text)
WHERE record_hash IS NULL;

ALTER TABLE public.service_history
  ALTER COLUMN record_hash SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_history_record_hash_idx
  ON public.service_history (record_hash);

CREATE INDEX IF NOT EXISTS service_history_service_started_idx
  ON public.service_history (service, started_at);

ALTER TABLE public.service_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.service_history TO service_role;

CREATE TABLE IF NOT EXISTS public.mlr_models (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trained_at timestamptz NOT NULL DEFAULT now(),
  n_train integer NOT NULL CHECK (n_train > 0),
  n_test integer NOT NULL CHECK (n_test > 0),
  r2_test numeric,
  mae_test numeric,
  model jsonb NOT NULL,
  active boolean NOT NULL DEFAULT false
);

ALTER TABLE public.mlr_models
  ADD COLUMN IF NOT EXISTS baseline_mae numeric,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trained_at timestamptz NOT NULL DEFAULT now();

UPDATE public.mlr_models
SET baseline_mae = coalesce(mae_test, 0),
    created_at = coalesce(created_at, trained_at)
WHERE baseline_mae IS NULL;

WITH active_models AS (
  SELECT id, row_number() OVER (ORDER BY trained_at DESC, id DESC) AS position
  FROM public.mlr_models
  WHERE active
)
UPDATE public.mlr_models AS model
SET active = false
FROM active_models
WHERE model.id = active_models.id
  AND active_models.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS mlr_models_one_active_idx
  ON public.mlr_models (active)
  WHERE active;

ALTER TABLE public.mlr_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mlr_models FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mlr_models TO service_role;

CREATE OR REPLACE FUNCTION public.activate_mlr_model(p_model_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('lynq_mlr_model_activation'));
  PERFORM 1 FROM public.mlr_models WHERE id = p_model_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forecast model not found.' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.mlr_models SET active = false WHERE active;
  UPDATE public.mlr_models SET active = true WHERE id = p_model_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_mlr_model(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_mlr_model(bigint) TO service_role;
