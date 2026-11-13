WITH requested_seats(label, seat_number) AS (
  VALUES
    ('Hair Chair 5', 5),
    ('Hair Chair 6', 6),
    ('Hair Chair 7', 7)
)
INSERT INTO public.customer_service_seats (id, label, category, is_active, manual_status)
SELECT gen_random_uuid(), requested.label, 'Hair', true, 'available'
FROM requested_seats AS requested
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customer_service_seats AS existing
  WHERE (existing.category ILIKE '%hair%' OR existing.label ILIKE '%hair%')
    AND existing.label ~ ('(^|[^0-9])' || requested.seat_number::text || '$')
);
