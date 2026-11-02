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
