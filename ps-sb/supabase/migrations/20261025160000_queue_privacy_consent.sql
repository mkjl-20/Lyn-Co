ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_notice_version text,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD CONSTRAINT queue_entries_marketing_requires_privacy_consent
    CHECK (marketing_consent_at IS NULL OR privacy_consent_at IS NOT NULL),
  ADD CONSTRAINT queue_entries_privacy_version_requires_consent
    CHECK ((privacy_consent_at IS NULL) = (privacy_notice_version IS NULL));
