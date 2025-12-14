-- FIX USER DATA ISOLATION
-- This script fixes the data mixing issue by adding user_id columns,
-- triggers, and proper RLS policies to ensure users only see their own data
-- Run this ENTIRE script in Supabase SQL Editor
--
-- WHAT THIS SCRIPT DOES:
-- 1. Adds user_id columns to buildings, units, bills, payments, and tenants tables
-- 2. Creates triggers to automatically set user_id on insert:
--    - Buildings: uses auth.uid()
--    - Units: inherits from building, falls back to auth.uid()
--    - Bills: inherits from unit, falls back to auth.uid()
--    - Payments: inherits from unit, falls back to auth.uid()
--    - Tenants: inherits from unit if assigned, falls back to auth.uid()
-- 3. Updates existing data by inheriting user_id from related tables
-- 4. Replaces permissive RLS policies with user-specific policies
--
-- IMPORTANT NOTES:
-- - After running this script, users will ONLY see their own data
-- - Existing data without user_id will be assigned based on relationships (units inherit from buildings, etc.)
-- - If you have data that needs to be reassigned to different users, do it manually after running this script
-- - Test the application after running this script to ensure everything works correctly

-- ============================================
-- STEP 1: ADD user_id COLUMNS TO TABLES
-- ============================================

-- Add user_id to buildings table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'buildings' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE buildings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_buildings_user_id ON buildings(user_id);
    END IF;
END $$;

-- Add user_id to units table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'units' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE units ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_units_user_id ON units(user_id);
    END IF;
END $$;

-- Add user_id to bills table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE bills ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id);
    END IF;
END $$;

-- Add user_id to payments table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payments' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE payments ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
    END IF;
END $$;

-- Ensure tenants table has user_id (may already exist from caretaker fix)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE tenants ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);
    END IF;
END $$;

-- ============================================
-- STEP 2: CREATE TRIGGERS TO AUTO-SET user_id
-- ============================================

-- Function to set user_id on insert for buildings
CREATE OR REPLACE FUNCTION set_buildings_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        NEW.user_id = auth.uid();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user_id on insert for units (from building if available, otherwise auth.uid)
CREATE OR REPLACE FUNCTION set_units_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        -- Try to get user_id from building
        SELECT user_id INTO NEW.user_id FROM buildings WHERE id = NEW.building_id;
        -- If building doesn't have user_id or doesn't exist, use auth.uid()
        IF NEW.user_id IS NULL THEN
            NEW.user_id = auth.uid();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user_id on insert for bills (from unit)
CREATE OR REPLACE FUNCTION set_bills_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        -- Get user_id from the related unit
        SELECT user_id INTO NEW.user_id FROM units WHERE id = NEW.unit_id;
        -- If unit doesn't have user_id or doesn't exist, use auth.uid()
        IF NEW.user_id IS NULL THEN
            NEW.user_id = auth.uid();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user_id on insert for payments (from unit)
CREATE OR REPLACE FUNCTION set_payments_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        -- Get user_id from the related unit
        SELECT user_id INTO NEW.user_id FROM units WHERE id = NEW.unit_id;
        -- If unit doesn't have user_id or doesn't exist, use auth.uid()
        IF NEW.user_id IS NULL THEN
            NEW.user_id = auth.uid();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user_id on insert for tenants
CREATE OR REPLACE FUNCTION set_tenants_user_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NULL THEN
        -- Try to get user_id from unit if tenant is assigned to a unit
        IF NEW.unit_id IS NOT NULL THEN
            SELECT user_id INTO NEW.user_id FROM units WHERE id = NEW.unit_id;
        END IF;
        -- If unit doesn't have user_id or tenant has no unit, use auth.uid()
        IF NEW.user_id IS NULL THEN
            NEW.user_id = auth.uid();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers for each table
DROP TRIGGER IF EXISTS set_buildings_user_id ON buildings;
CREATE TRIGGER set_buildings_user_id
    BEFORE INSERT ON buildings
    FOR EACH ROW
    EXECUTE FUNCTION set_buildings_user_id();

DROP TRIGGER IF EXISTS set_units_user_id ON units;
CREATE TRIGGER set_units_user_id
    BEFORE INSERT ON units
    FOR EACH ROW
    EXECUTE FUNCTION set_units_user_id();

DROP TRIGGER IF EXISTS set_bills_user_id ON bills;
CREATE TRIGGER set_bills_user_id
    BEFORE INSERT ON bills
    FOR EACH ROW
    EXECUTE FUNCTION set_bills_user_id();

DROP TRIGGER IF EXISTS set_payments_user_id ON payments;
CREATE TRIGGER set_payments_user_id
    BEFORE INSERT ON payments
    FOR EACH ROW
    EXECUTE FUNCTION set_payments_user_id();

DROP TRIGGER IF EXISTS set_tenants_user_id ON tenants;
CREATE TRIGGER set_tenants_user_id
    BEFORE INSERT ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION set_tenants_user_id();

-- ============================================
-- STEP 3: UPDATE EXISTING DATA (Assign based on relationships)
-- ============================================
-- Note: This assigns existing data without user_id based on relationships
-- If you need to assign all data to a specific user, run ASSIGN_ALL_DATA_TO_USER.sql separately

-- For units, inherit user_id from their building if building has user_id
UPDATE units
SET user_id = (SELECT user_id FROM buildings WHERE buildings.id = units.building_id)
WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM buildings WHERE buildings.id = units.building_id AND buildings.user_id IS NOT NULL);

-- For bills and payments, inherit user_id from their related unit
UPDATE bills
SET user_id = (SELECT user_id FROM units WHERE units.id = bills.unit_id)
WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM units WHERE units.id = bills.unit_id AND units.user_id IS NOT NULL);

UPDATE payments
SET user_id = (SELECT user_id FROM units WHERE units.id = payments.unit_id)
WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM units WHERE units.id = payments.unit_id AND units.user_id IS NOT NULL);

-- For tenants, inherit user_id from their unit if assigned
UPDATE tenants
SET user_id = (SELECT user_id FROM units WHERE units.id = tenants.unit_id)
WHERE user_id IS NULL AND EXISTS (SELECT 1 FROM units WHERE units.id = tenants.unit_id AND units.user_id IS NOT NULL);

-- ============================================
-- STEP 4: UPDATE RLS POLICIES
-- ============================================

-- Drop ALL existing policies for buildings
DROP POLICY IF EXISTS "Allow all for authenticated users on buildings" ON buildings;
DROP POLICY IF EXISTS "Users can view their own buildings" ON buildings;
DROP POLICY IF EXISTS "Users can insert their own buildings" ON buildings;
DROP POLICY IF EXISTS "Users can update their own buildings" ON buildings;
DROP POLICY IF EXISTS "Users can delete their own buildings" ON buildings;

-- Drop ALL existing policies for units
DROP POLICY IF EXISTS "Allow all for authenticated users on units" ON units;
DROP POLICY IF EXISTS "Users can view their own units" ON units;
DROP POLICY IF EXISTS "Users can insert their own units" ON units;
DROP POLICY IF EXISTS "Users can update their own units" ON units;
DROP POLICY IF EXISTS "Users can delete their own units" ON units;

-- Drop ALL existing policies for bills
DROP POLICY IF EXISTS "Allow all for authenticated users on bills" ON bills;
DROP POLICY IF EXISTS "Users can view their own bills" ON bills;
DROP POLICY IF EXISTS "Users can insert their own bills" ON bills;
DROP POLICY IF EXISTS "Users can update their own bills" ON bills;
DROP POLICY IF EXISTS "Users can delete their own bills" ON bills;

-- Drop ALL existing policies for payments
DROP POLICY IF EXISTS "Allow all for authenticated users on payments" ON payments;
DROP POLICY IF EXISTS "Users can view their own payments" ON payments;
DROP POLICY IF EXISTS "Users can insert their own payments" ON payments;
DROP POLICY IF EXISTS "Users can update their own payments" ON payments;
DROP POLICY IF EXISTS "Users can delete their own payments" ON payments;

-- Drop basic tenant policies (but preserve caretaker policies if they exist)
DROP POLICY IF EXISTS "Allow all for authenticated users on tenants" ON tenants;
DROP POLICY IF EXISTS "Users can view their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users can insert their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users can update their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users can delete their own tenants" ON tenants;

-- Buildings policies - users can only see their own buildings
CREATE POLICY "Users can view their own buildings"
    ON buildings FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own buildings"
    ON buildings FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own buildings"
    ON buildings FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own buildings"
    ON buildings FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Units policies - users can only see their own units
CREATE POLICY "Users can view their own units"
    ON units FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own units"
    ON units FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own units"
    ON units FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own units"
    ON units FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Bills policies - users can only see bills for their units
-- Also check via unit relationship as fallback
CREATE POLICY "Users can view their own bills"
    ON bills FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM units 
            WHERE units.id = bills.unit_id 
            AND units.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own bills"
    ON bills FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bills"
    ON bills FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM units 
            WHERE units.id = bills.unit_id 
            AND units.user_id = auth.uid()
        )
    )
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bills"
    ON bills FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM units 
            WHERE units.id = bills.unit_id 
            AND units.user_id = auth.uid()
        )
    );

-- Payments policies - users can only see payments for their units
CREATE POLICY "Users can view their own payments"
    ON payments FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM units 
            WHERE units.id = payments.unit_id 
            AND units.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own payments"
    ON payments FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own payments"
    ON payments FOR UPDATE
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM units 
            WHERE units.id = payments.unit_id 
            AND units.user_id = auth.uid()
        )
    )
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own payments"
    ON payments FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM units 
            WHERE units.id = payments.unit_id 
            AND units.user_id = auth.uid()
        )
    );

-- Tenants policies - users can only see their own tenants
-- Check if tenants already have proper policies (from caretaker fix), if so, keep them
-- Otherwise create basic user isolation policies
DO $$
BEGIN
    -- Only create basic policies if caretaker policies don't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'tenants' 
        AND policyname LIKE '%caretaker%'
    ) THEN
        CREATE POLICY "Users can view their own tenants"
            ON tenants FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);

        CREATE POLICY "Users can insert their own tenants"
            ON tenants FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can update their own tenants"
            ON tenants FOR UPDATE
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);

        CREATE POLICY "Users can delete their own tenants"
            ON tenants FOR DELETE
            TO authenticated
            USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================
-- STEP 5: VERIFY SETUP
-- ============================================
SELECT 
    'Setup Complete' as status,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'buildings' AND column_name = 'user_id') as buildings_has_user_id,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'units' AND column_name = 'user_id') as units_has_user_id,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'user_id') as bills_has_user_id,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'user_id') as payments_has_user_id,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'user_id') as tenants_has_user_id,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'buildings' AND policyname LIKE '%own%') as buildings_policies,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'units' AND policyname LIKE '%own%') as units_policies,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'bills' AND policyname LIKE '%own%') as bills_policies,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'payments' AND policyname LIKE '%own%') as payments_policies;

