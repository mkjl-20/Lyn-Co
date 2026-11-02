ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS image_data_url text;

ALTER TABLE public.service_packages
  ADD COLUMN IF NOT EXISTS image_data_url text;
