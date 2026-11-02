ALTER TABLE public.promotions
  ADD COLUMN eligible_service_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN minimum_spend numeric(10, 2),
  ADD COLUMN maximum_discount numeric(10, 2),
  ADD COLUMN usage_limit integer,
  ADD COLUMN redemption_count integer NOT NULL DEFAULT 0,
  ADD COLUMN one_per_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN exclude_packages boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT promotions_minimum_spend_nonnegative CHECK (minimum_spend IS NULL OR minimum_spend >= 0),
  ADD CONSTRAINT promotions_maximum_discount_positive CHECK (maximum_discount IS NULL OR maximum_discount > 0),
  ADD CONSTRAINT promotions_usage_limit_positive CHECK (usage_limit IS NULL OR usage_limit > 0),
  ADD CONSTRAINT promotions_redemption_count_nonnegative CHECK (redemption_count >= 0);

CREATE TABLE public.promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  queue_entry_id uuid NOT NULL UNIQUE REFERENCES public.queue_entries(id) ON DELETE CASCADE,
  contact_number text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_id, queue_entry_id)
);

CREATE INDEX promotion_redemptions_promotion_idx
  ON public.promotion_redemptions (promotion_id, redeemed_at);

CREATE INDEX promotion_redemptions_customer_idx
  ON public.promotion_redemptions (promotion_id, contact_number)
  WHERE contact_number IS NOT NULL;

ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.promotion_redemptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.promotion_redemptions TO service_role;

CREATE OR REPLACE FUNCTION public.claim_promotion_redemption(
  p_promotion_id uuid,
  p_queue_entry_id uuid,
  p_contact_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promotion public.promotions%ROWTYPE;
  v_contact_number text := nullif(trim(p_contact_number), '');
BEGIN
  SELECT *
    INTO v_promotion
    FROM public.promotions
   WHERE id = p_promotion_id
   FOR UPDATE;

  IF NOT FOUND
     OR NOT v_promotion.is_active
     OR v_promotion.start_date > now()
     OR v_promotion.end_date < now() THEN
    RAISE EXCEPTION 'Promotion is no longer active.' USING ERRCODE = 'P0001';
  END IF;

  IF v_promotion.usage_limit IS NOT NULL
     AND v_promotion.redemption_count >= v_promotion.usage_limit THEN
    RAISE EXCEPTION 'Promotion redemption limit has been reached.' USING ERRCODE = 'P0001';
  END IF;

  IF v_promotion.one_per_customer THEN
    IF v_contact_number IS NULL THEN
      RAISE EXCEPTION 'A customer phone number is required for this promotion.' USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.promotion_redemptions
       WHERE promotion_id = p_promotion_id
         AND contact_number = v_contact_number
    ) THEN
      RAISE EXCEPTION 'This customer has already used this promotion.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.promotion_redemptions (promotion_id, queue_entry_id, contact_number)
  VALUES (p_promotion_id, p_queue_entry_id, v_contact_number);

  UPDATE public.promotions
     SET redemption_count = redemption_count + 1
   WHERE id = p_promotion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_promotion_redemption(
  p_promotion_id uuid,
  p_queue_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
    FROM public.promotions
   WHERE id = p_promotion_id
   FOR UPDATE;

  DELETE FROM public.promotion_redemptions
   WHERE promotion_id = p_promotion_id
     AND queue_entry_id = p_queue_entry_id;
  IF FOUND THEN
    UPDATE public.promotions
       SET redemption_count = greatest(0, redemption_count - 1)
     WHERE id = p_promotion_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_promotion_redemption(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_promotion_redemption(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_promotion_redemption(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_promotion_redemption(uuid, uuid) TO service_role;
