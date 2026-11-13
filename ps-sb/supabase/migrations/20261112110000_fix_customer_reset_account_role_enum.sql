CREATE OR REPLACE FUNCTION public.reset_lynq_operational_history()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  staff_ids uuid[];
  customer_ids uuid[];
  cleared_counts jsonb := '{}'::jsonb;
  affected_count bigint;
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO staff_ids
  FROM public.profiles
  WHERE account_role = 'staff';

  SELECT COALESCE(array_agg(customer_accounts.user_id), ARRAY[]::uuid[])
  INTO customer_ids
  FROM public.customer_accounts
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = customer_accounts.user_id
      AND profiles.account_role IN ('admin', 'staff')
  );

  DELETE FROM public.pos_transaction_adjustments;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('pos_transaction_adjustments', affected_count);

  DELETE FROM public.pos_transaction_items;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('pos_transaction_items', affected_count);

  DELETE FROM public.pos_transactions;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('pos_transactions', affected_count);

  DELETE FROM public.promotion_redemptions;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('promotion_redemptions', affected_count);

  DELETE FROM public.customer_tag_assignments;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('customer_tag_assignments', affected_count);

  DELETE FROM public.customer_tags;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('customer_tags', affected_count);

  DELETE FROM public.customer_package_balances;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('customer_package_balances', affected_count);

  DELETE FROM public.service_history;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('service_history', affected_count);

  DELETE FROM public.forecast_logs;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('forecast_logs', affected_count);

  DELETE FROM public.mlr_models;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('mlr_models', affected_count);

  DELETE FROM public.system_settings WHERE key = 'ewt_model';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('ewt_model_setting', affected_count);

  DELETE FROM public.queue_sms_outbox;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('queue_sms_outbox', affected_count);

  DELETE FROM public.staff_rebalance_requests;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('staff_rebalance_requests', affected_count);

  DELETE FROM public.staff_station_coverage_grants;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('staff_station_coverage_grants', affected_count);

  DELETE FROM public.staff_availability;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('staff_availability', affected_count);

  DELETE FROM public.queue_entry_services;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('queue_entry_services', affected_count);

  DELETE FROM public.customer_service_seats;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('customer_service_seats', affected_count);

  DELETE FROM public.queue_entries;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('queue_entries', affected_count);

  DELETE FROM public.queue_parties;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('queue_parties', affected_count);

  DELETE FROM public.customer_records;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('customer_records', affected_count);

  DELETE FROM public.customer_accounts;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('customer_accounts', affected_count);

  DELETE FROM public.promotions;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('promotions', affected_count);

  DELETE FROM auth.users
  WHERE id = ANY (customer_ids);
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('customer_auth_accounts', affected_count);

  UPDATE public.stations
  SET home_staff_id = NULL
  WHERE home_staff_id = ANY (staff_ids);
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('station_staff_assignments', affected_count);

  UPDATE public.profiles
  SET is_active = false
  WHERE id = ANY (staff_ids);
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  cleared_counts := cleared_counts || jsonb_build_object('staff_profiles_deactivated', affected_count);

  RETURN cleared_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_lynq_operational_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_lynq_operational_history() TO service_role;
