ALTER TABLE public.customer_accounts
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_notice_version text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_accounts_privacy_consent_pair_check'
      AND conrelid = 'public.customer_accounts'::regclass
  ) THEN
    ALTER TABLE public.customer_accounts
      ADD CONSTRAINT customer_accounts_privacy_consent_pair_check
      CHECK ((privacy_consent_at IS NULL) = (privacy_notice_version IS NULL));
  END IF;
END;
$$;
