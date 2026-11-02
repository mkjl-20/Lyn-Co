CREATE TABLE IF NOT EXISTS public.service_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 100),
  description text,
  package_type text NOT NULL CHECK (package_type IN ('service_bundle', 'prepaid_sessions')),
  price numeric(10, 2) NOT NULL CHECK (price >= 0),
  sessions_count integer NOT NULL DEFAULT 0 CHECK (sessions_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_packages_session_count_matches_type CHECK (
    (package_type = 'service_bundle' AND sessions_count = 0)
    OR (package_type = 'prepaid_sessions' AND sessions_count > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.service_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  UNIQUE (package_id, service_id)
);

CREATE TABLE IF NOT EXISTS public.customer_package_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.service_packages(id) ON DELETE RESTRICT,
  contact_number text NOT NULL,
  customer_name text NOT NULL,
  sessions_total integer NOT NULL CHECK (sessions_total > 0),
  sessions_remaining integer NOT NULL CHECK (sessions_remaining >= 0 AND sessions_remaining <= sessions_total),
  list_price numeric(10, 2) NOT NULL CHECK (list_price >= 0),
  discount_amount numeric(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0 AND discount_amount <= list_price),
  amount_paid numeric(10, 2) NOT NULL CHECK (amount_paid >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'card', 'ewallet', 'other')),
  promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
  purchased_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS service_package_id uuid REFERENCES public.service_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_balance_id uuid REFERENCES public.customer_package_balances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS service_packages_active_idx
  ON public.service_packages (is_active, package_type);
CREATE INDEX IF NOT EXISTS service_package_items_package_idx
  ON public.service_package_items (package_id);
CREATE INDEX IF NOT EXISTS customer_package_balances_customer_idx
  ON public.customer_package_balances (contact_number, package_id, sessions_remaining)
  WHERE sessions_remaining > 0;

CREATE OR REPLACE FUNCTION public.reserve_customer_package_session(p_entry_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.queue_entries%ROWTYPE;
  v_package public.service_packages%ROWTYPE;
  v_balance_id uuid;
BEGIN
  SELECT * INTO v_entry
  FROM public.queue_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND OR v_entry.service_package_id IS NULL THEN
    RETURN true;
  END IF;

  IF v_entry.package_balance_id IS NOT NULL THEN
    RETURN true;
  END IF;

  SELECT * INTO v_package
  FROM public.service_packages
  WHERE id = v_entry.service_package_id;

  IF NOT FOUND OR v_package.package_type <> 'prepaid_sessions' THEN
    RETURN true;
  END IF;

  IF v_entry.contact_number IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO v_balance_id
  FROM public.customer_package_balances
  WHERE package_id = v_package.id
    AND contact_number = v_entry.contact_number
    AND sessions_remaining > 0
  ORDER BY purchased_at ASC, id ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.customer_package_balances
  SET sessions_remaining = sessions_remaining - 1
  WHERE id = v_balance_id;

  UPDATE public.queue_entries
  SET package_balance_id = v_balance_id
  WHERE id = p_entry_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_customer_package_session(p_entry_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_id uuid;
BEGIN
  SELECT package_balance_id INTO v_balance_id
  FROM public.queue_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND OR v_balance_id IS NULL OR EXISTS (
    SELECT 1
    FROM public.queue_entry_services
    WHERE queue_entry_id = p_entry_id
      AND service_started_at IS NOT NULL
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.customer_package_balances
  SET sessions_remaining = LEAST(sessions_total, sessions_remaining + 1)
  WHERE id = v_balance_id;

  UPDATE public.queue_entries
  SET package_balance_id = NULL
  WHERE id = p_entry_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_cancelled_package_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE'
    AND OLD.package_balance_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_entry_services
      WHERE queue_entry_id = OLD.id AND service_started_at IS NOT NULL
    ) THEN
    UPDATE public.customer_package_balances
    SET sessions_remaining = LEAST(sessions_total, sessions_remaining + 1)
    WHERE id = OLD.package_balance_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM 'cancelled'
    AND NEW.status IN ('cancelled', 'no_show')
    AND NEW.package_balance_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_entry_services
      WHERE queue_entry_id = NEW.id AND service_started_at IS NOT NULL
    ) THEN
    UPDATE public.customer_package_balances
    SET sessions_remaining = LEAST(sessions_total, sessions_remaining + 1)
    WHERE id = NEW.package_balance_id;

    NEW.package_balance_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS queue_entry_restore_package_session_update ON public.queue_entries;
CREATE TRIGGER queue_entry_restore_package_session_update
  BEFORE UPDATE OF status ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_cancelled_package_session();

DROP TRIGGER IF EXISTS queue_entry_restore_package_session_delete ON public.queue_entries;
CREATE TRIGGER queue_entry_restore_package_session_delete
  BEFORE DELETE ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.restore_cancelled_package_session();

REVOKE ALL ON FUNCTION public.reserve_customer_package_session(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_customer_package_session(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_customer_package_session(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_customer_package_session(uuid) TO service_role;

REVOKE ALL ON TABLE public.service_packages, public.service_package_items, public.customer_package_balances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_packages, public.service_package_items, public.customer_package_balances TO service_role;

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_read_service_packages ON public.service_packages;
CREATE POLICY authenticated_read_service_packages
  ON public.service_packages
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS authenticated_read_service_package_items ON public.service_package_items;
CREATE POLICY authenticated_read_service_package_items
  ON public.service_package_items
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.service_packages, public.service_package_items TO authenticated;
