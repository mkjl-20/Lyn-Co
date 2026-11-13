DO $$
DECLARE
  table_name text;
  publication_is_all_tables boolean;
BEGIN
  SELECT puballtables
  INTO publication_is_all_tables
  FROM pg_publication
  WHERE pubname = 'supabase_realtime';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supabase Realtime publication was not found.';
  END IF;

  IF publication_is_all_tables THEN
    RETURN;
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'queue_entries',
    'queue_entry_services',
    'staff_availability',
    'customer_service_seats'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
