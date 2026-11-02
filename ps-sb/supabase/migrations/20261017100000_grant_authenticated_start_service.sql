REVOKE ALL ON FUNCTION public.start_service_item_and_release_lounge_seat(uuid, uuid, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_service_item_and_release_lounge_seat(uuid, uuid, uuid)
  TO authenticated;
