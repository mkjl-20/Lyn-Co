CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.system_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.system_settings (key, value)
VALUES (
  'salon_settings',
  '{
    "salonName": "Lyn & Co Salon and Spa",
    "contactNumber": "",
    "address": "",
    "openingTime": "09:00",
    "closingTime": "21:00",
    "crowdThreshold": 8,
    "queueUrl": "",
    "themeColor": "monochrome",
    "logoDataUrl": ""
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
