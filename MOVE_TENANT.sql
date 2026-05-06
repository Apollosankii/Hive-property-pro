-- Atomic tenant move (unit transfer) with move-month billing split.
--
-- Move date rule:
-- - p_move_date is the FIRST day the tenant occupies the new unit.
--   Old unit is billed up to the day BEFORE p_move_date.
--
-- If p_prorate = false:
-- - Old unit keeps full-month rent for p_move_month
-- - New unit rent for p_move_month is set to 0 (starts next month)

CREATE OR REPLACE FUNCTION public.rpc_move_tenant(
  p_tenant_id uuid,
  p_from_unit_id uuid,
  p_to_unit_id uuid,
  p_move_date date,
  p_move_month date,
  p_water_move_reading numeric DEFAULT NULL,
  p_elec_move_reading numeric DEFAULT NULL,
  p_prorate boolean DEFAULT true
)
RETURNS TABLE (
  old_bill_id uuid,
  new_bill_id uuid,
  from_unit_id uuid,
  to_unit_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date;
  v_month_end_excl date;
  v_days_in_month int;
  v_old_days int;
  v_new_days int;

  v_tenant tenants%ROWTYPE;
  v_from_unit units%ROWTYPE;
  v_to_unit units%ROWTYPE;

  v_prev_water numeric := 0;
  v_prev_elec numeric := 0;

  v_old_bill_id uuid;
  v_new_bill_id uuid;

  v_effective_water numeric := NULL;
  v_effective_elec numeric := NULL;

  v_old_rent numeric := 0;
  v_new_rent numeric := 0;
  v_old_balance numeric := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_from_unit_id IS NULL OR p_to_unit_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id, from_unit_id and to_unit_id are required';
  END IF;

  v_month_start := date_trunc('month', p_move_month)::date;
  v_month_end_excl := (v_month_start + INTERVAL '1 month')::date;

  IF p_move_date IS NULL THEN
    RAISE EXCEPTION 'move_date is required';
  END IF;
  IF p_move_date < v_month_start OR p_move_date >= v_month_end_excl THEN
    RAISE EXCEPTION 'move_date (%) must be within move_month (%)', p_move_date, v_month_start;
  END IF;

  v_days_in_month := (v_month_end_excl - v_month_start);
  v_old_days := (p_move_date - v_month_start);
  v_new_days := (v_month_end_excl - p_move_date);

  SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;
  IF v_tenant.status <> 'active' THEN
    RAISE EXCEPTION 'tenant is not active';
  END IF;
  IF v_tenant.unit_id IS DISTINCT FROM p_from_unit_id THEN
    RAISE EXCEPTION 'tenant is not assigned to from_unit_id';
  END IF;

  SELECT * INTO v_from_unit FROM units WHERE id = p_from_unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'from_unit not found';
  END IF;
  IF v_from_unit.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'from_unit does not have this tenant';
  END IF;

  SELECT * INTO v_to_unit FROM units WHERE id = p_to_unit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'to_unit not found';
  END IF;
  IF v_to_unit.status <> 'vacant' OR v_to_unit.tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'to_unit is not vacant';
  END IF;

  -- Previous readings for from_unit (latest bill before move_month)
  SELECT
    COALESCE(b.water_current_reading, 0),
    COALESCE(b.elec_current_reading, 0)
  INTO v_prev_water, v_prev_elec
  FROM bills b
  WHERE b.unit_id = p_from_unit_id
    AND b.billing_month < v_month_start
  ORDER BY b.billing_month DESC
  LIMIT 1;

  -- Ensure old bill exists for from_unit + move_month
  SELECT b.id INTO v_old_bill_id
  FROM bills b
  WHERE b.unit_id = p_from_unit_id
    AND b.billing_month = v_month_start
  FOR UPDATE;

  IF v_old_bill_id IS NULL THEN
    INSERT INTO bills (
      unit_id,
      tenant_id,
      billing_month,
      water_prev_reading,
      water_current_reading,
      elec_prev_reading,
      elec_current_reading,
      rent_amount,
      arrears_brought_forward,
      amount_paid,
      status
    ) VALUES (
      p_from_unit_id,
      p_tenant_id,
      v_month_start,
      v_prev_water,
      v_prev_water,
      v_prev_elec,
      v_prev_elec,
      0,
      0,
      0,
      'pending'
    )
    RETURNING id INTO v_old_bill_id;
  END IF;

  -- Update old bill readings only if explicitly provided
  UPDATE bills
  SET
    tenant_id = p_tenant_id,
    water_current_reading = CASE
      WHEN p_water_move_reading IS NULL THEN water_current_reading
      ELSE p_water_move_reading
    END,
    elec_current_reading = CASE
      WHEN p_elec_move_reading IS NULL THEN elec_current_reading
      ELSE p_elec_move_reading
    END
  WHERE id = v_old_bill_id;

  -- Effective readings after potential update (used as new-unit start readings)
  SELECT
    COALESCE(water_current_reading, 0),
    COALESCE(elec_current_reading, 0)
  INTO v_effective_water, v_effective_elec
  FROM bills
  WHERE id = v_old_bill_id;

  -- Rent proration (move_date is first day in NEW unit)
  IF p_prorate THEN
    v_old_rent := round((COALESCE(v_from_unit.monthly_rent, 0) * v_old_days::numeric / v_days_in_month::numeric)::numeric, 2);
    v_new_rent := round((COALESCE(v_to_unit.monthly_rent, 0) * v_new_days::numeric / v_days_in_month::numeric)::numeric, 2);
  ELSE
    v_old_rent := COALESCE(v_from_unit.monthly_rent, 0);
    v_new_rent := 0;
  END IF;

  UPDATE bills
  SET rent_amount = v_old_rent
  WHERE id = v_old_bill_id;

  -- Ensure new bill exists for to_unit + move_month
  SELECT b.id INTO v_new_bill_id
  FROM bills b
  WHERE b.unit_id = p_to_unit_id
    AND b.billing_month = v_month_start
  FOR UPDATE;

  IF v_new_bill_id IS NULL THEN
    INSERT INTO bills (
      unit_id,
      tenant_id,
      billing_month,
      water_prev_reading,
      water_current_reading,
      elec_prev_reading,
      elec_current_reading,
      rent_amount,
      arrears_brought_forward,
      amount_paid,
      status
    ) VALUES (
      p_to_unit_id,
      p_tenant_id,
      v_month_start,
      COALESCE(v_effective_water, 0),
      COALESCE(v_effective_water, 0),
      COALESCE(v_effective_elec, 0),
      COALESCE(v_effective_elec, 0),
      v_new_rent,
      0,
      0,
      'pending'
    )
    RETURNING id INTO v_new_bill_id;
  ELSE
    -- If the new bill is still at "start-of-month" (no consumption yet), rebase it to move readings.
    UPDATE bills
    SET
      tenant_id = p_tenant_id,
      water_prev_reading = CASE
        WHEN water_current_reading = water_prev_reading THEN COALESCE(v_effective_water, water_prev_reading)
        ELSE water_prev_reading
      END,
      water_current_reading = CASE
        WHEN water_current_reading = water_prev_reading THEN COALESCE(v_effective_water, water_current_reading)
        ELSE water_current_reading
      END,
      elec_prev_reading = CASE
        WHEN elec_current_reading = elec_prev_reading THEN COALESCE(v_effective_elec, elec_prev_reading)
        ELSE elec_prev_reading
      END,
      elec_current_reading = CASE
        WHEN elec_current_reading = elec_prev_reading THEN COALESCE(v_effective_elec, elec_current_reading)
        ELSE elec_current_reading
      END,
      rent_amount = v_new_rent
    WHERE id = v_new_bill_id;
  END IF;

  -- Carry forward any remaining balance from old bill into new bill arrears.
  SELECT COALESCE(balance, 0) INTO v_old_balance FROM bills WHERE id = v_old_bill_id;
  UPDATE bills
  SET arrears_brought_forward = GREATEST(v_old_balance, 0)
  WHERE id = v_new_bill_id;

  -- Reassign tenant/unit links
  UPDATE units
  SET tenant_id = NULL, status = 'vacant'
  WHERE id = p_from_unit_id;

  UPDATE units
  SET tenant_id = p_tenant_id, status = 'occupied'
  WHERE id = p_to_unit_id;

  UPDATE tenants
  SET unit_id = p_to_unit_id
  WHERE id = p_tenant_id;

  old_bill_id := v_old_bill_id;
  new_bill_id := v_new_bill_id;
  from_unit_id := p_from_unit_id;
  to_unit_id := p_to_unit_id;
  RETURN NEXT;
END;
$$;

