-- ENFORCE USER DATA ISOLATION (Landlord-level multi-tenancy)
--
-- Use this if you can see other landlords' buildings/tenants/units/bills/payments.
-- It:
-- - Ensures `user_id` exists on core tables
-- - Backfills user_id via buildings -> units -> tenants/bills/payments
-- - Enables RLS
-- - DROPS permissive "Allow all for authenticated users" policies
-- - Creates strict per-user policies
--
-- Run in Supabase SQL Editor.

BEGIN;

-- 1) Ensure user_id columns exist (idempotent)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE units      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE tenants    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE bills      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE payments   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_buildings_user_id ON buildings(user_id);
CREATE INDEX IF NOT EXISTS idx_units_user_id      ON units(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_user_id    ON tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_bills_user_id      ON bills(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id   ON payments(user_id);

-- 2) Backfill user_id using relationships
-- Buildings: keep existing user_id; leave NULL if unknown (must be repaired manually)
-- Units inherit from building
UPDATE units u
SET user_id = b.user_id
FROM buildings b
WHERE u.building_id = b.id
  AND u.user_id IS DISTINCT FROM b.user_id
  AND b.user_id IS NOT NULL;

-- Tenants inherit from their unit (if assigned)
UPDATE tenants t
SET user_id = u.user_id
FROM units u
WHERE t.unit_id = u.id
  AND u.user_id IS NOT NULL
  AND t.user_id IS DISTINCT FROM u.user_id;

-- Bills inherit from unit
UPDATE bills bl
SET user_id = u.user_id
FROM units u
WHERE bl.unit_id = u.id
  AND u.user_id IS NOT NULL
  AND bl.user_id IS DISTINCT FROM u.user_id;

-- Payments inherit from unit
UPDATE payments p
SET user_id = u.user_id
FROM units u
WHERE p.unit_id = u.id
  AND u.user_id IS NOT NULL
  AND p.user_id IS DISTINCT FROM u.user_id;

-- 3) Auto-assign user_id on INSERT (triggers)
CREATE OR REPLACE FUNCTION public.tg_set_buildings_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_units_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT b.user_id INTO NEW.user_id FROM buildings b WHERE b.id = NEW.building_id;
    IF NEW.user_id IS NULL THEN
      NEW.user_id := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_tenants_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    IF NEW.unit_id IS NOT NULL THEN
      SELECT u.user_id INTO NEW.user_id FROM units u WHERE u.id = NEW.unit_id;
    END IF;
    IF NEW.user_id IS NULL THEN
      NEW.user_id := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_bills_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT u.user_id INTO NEW.user_id FROM units u WHERE u.id = NEW.unit_id;
    IF NEW.user_id IS NULL THEN
      NEW.user_id := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_payments_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT u.user_id INTO NEW.user_id FROM units u WHERE u.id = NEW.unit_id;
    IF NEW.user_id IS NULL THEN
      NEW.user_id := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_buildings_user_id ON buildings;
CREATE TRIGGER set_buildings_user_id
  BEFORE INSERT ON buildings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_buildings_user_id();

DROP TRIGGER IF EXISTS set_units_user_id ON units;
CREATE TRIGGER set_units_user_id
  BEFORE INSERT ON units
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_units_user_id();

DROP TRIGGER IF EXISTS set_tenants_user_id ON tenants;
CREATE TRIGGER set_tenants_user_id
  BEFORE INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_tenants_user_id();

DROP TRIGGER IF EXISTS set_bills_user_id ON bills;
CREATE TRIGGER set_bills_user_id
  BEFORE INSERT ON bills
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_bills_user_id();

DROP TRIGGER IF EXISTS set_payments_user_id ON payments;
CREATE TRIGGER set_payments_user_id
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_payments_user_id();

-- 4) Enable RLS and enforce strict policies
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies that cause data mixing
DROP POLICY IF EXISTS "Allow all for authenticated users on buildings" ON buildings;
DROP POLICY IF EXISTS "Allow all for authenticated users on units" ON units;
DROP POLICY IF EXISTS "Allow all for authenticated users on tenants" ON tenants;
DROP POLICY IF EXISTS "Allow all for authenticated users on bills" ON bills;
DROP POLICY IF EXISTS "Allow all for authenticated users on payments" ON payments;

-- Drop old strict policies (if any) to avoid duplicates
DROP POLICY IF EXISTS "Users can view their own buildings" ON buildings;
DROP POLICY IF EXISTS "Users can insert their own buildings" ON buildings;
DROP POLICY IF EXISTS "Users can update their own buildings" ON buildings;
DROP POLICY IF EXISTS "Users can delete their own buildings" ON buildings;

DROP POLICY IF EXISTS "Users can view their own units" ON units;
DROP POLICY IF EXISTS "Users can insert their own units" ON units;
DROP POLICY IF EXISTS "Users can update their own units" ON units;
DROP POLICY IF EXISTS "Users can delete their own units" ON units;

DROP POLICY IF EXISTS "Users can view their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users can insert their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users can update their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users can delete their own tenants" ON tenants;

DROP POLICY IF EXISTS "Users can view their own bills" ON bills;
DROP POLICY IF EXISTS "Users can insert their own bills" ON bills;
DROP POLICY IF EXISTS "Users can update their own bills" ON bills;
DROP POLICY IF EXISTS "Users can delete their own bills" ON bills;

DROP POLICY IF EXISTS "Users can view their own payments" ON payments;
DROP POLICY IF EXISTS "Users can insert their own payments" ON payments;
DROP POLICY IF EXISTS "Users can update their own payments" ON payments;
DROP POLICY IF EXISTS "Users can delete their own payments" ON payments;

-- Buildings
CREATE POLICY "Users can view their own buildings"
  ON buildings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own buildings"
  ON buildings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own buildings"
  ON buildings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own buildings"
  ON buildings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Units
CREATE POLICY "Users can view their own units"
  ON units FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own units"
  ON units FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own units"
  ON units FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own units"
  ON units FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Tenants
CREATE POLICY "Users can view their own tenants"
  ON tenants FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tenants"
  ON tenants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tenants"
  ON tenants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tenants"
  ON tenants FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Bills (include relationship fallback to units for safety during backfill)
CREATE POLICY "Users can view their own bills"
  ON bills FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = bills.unit_id AND u.user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own bills"
  ON bills FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = bills.unit_id AND u.user_id = auth.uid())
  );

CREATE POLICY "Users can update their own bills"
  ON bills FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = bills.unit_id AND u.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = bills.unit_id AND u.user_id = auth.uid())
  );

CREATE POLICY "Users can delete their own bills"
  ON bills FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = bills.unit_id AND u.user_id = auth.uid())
  );

-- Payments (include relationship fallback to units for safety during backfill)
CREATE POLICY "Users can view their own payments"
  ON payments FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = payments.unit_id AND u.user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = payments.unit_id AND u.user_id = auth.uid())
  );

CREATE POLICY "Users can update their own payments"
  ON payments FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = payments.unit_id AND u.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = payments.unit_id AND u.user_id = auth.uid())
  );

CREATE POLICY "Users can delete their own payments"
  ON payments FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = payments.unit_id AND u.user_id = auth.uid())
  );

COMMIT;

-- Diagnostics: rows that still have NULL user_id (need manual reassignment)
SELECT 'buildings_null_user_id' AS table_name, COUNT(*) AS count FROM buildings WHERE user_id IS NULL
UNION ALL
SELECT 'units_null_user_id', COUNT(*) FROM units WHERE user_id IS NULL
UNION ALL
SELECT 'tenants_null_user_id', COUNT(*) FROM tenants WHERE user_id IS NULL
UNION ALL
SELECT 'bills_null_user_id', COUNT(*) FROM bills WHERE user_id IS NULL
UNION ALL
SELECT 'payments_null_user_id', COUNT(*) FROM payments WHERE user_id IS NULL;

