-- ASSIGN ALL DATA TO USER ID
-- This script assigns ALL existing data to user ID: 373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe
-- Use this to recover data that belonged to this user but got mixed up with another user
-- Run this script in your Supabase SQL Editor

-- ============================================
-- ASSIGN ALL DATA TO TARGET USER
-- ============================================

DO $$
DECLARE
    target_user_id UUID := '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe';
    buildings_count INTEGER;
    units_count INTEGER;
    bills_count INTEGER;
    payments_count INTEGER;
    tenants_count INTEGER;
    security_deposits_count INTEGER;
BEGIN
    -- Assign all buildings to the target user
    UPDATE buildings
    SET user_id = target_user_id
    WHERE user_id IS NULL OR user_id != target_user_id;
    GET DIAGNOSTICS buildings_count = ROW_COUNT;

    -- Assign all units to the target user
    UPDATE units
    SET user_id = target_user_id
    WHERE user_id IS NULL OR user_id != target_user_id;
    GET DIAGNOSTICS units_count = ROW_COUNT;

    -- Assign all bills to the target user
    UPDATE bills
    SET user_id = target_user_id
    WHERE user_id IS NULL OR user_id != target_user_id;
    GET DIAGNOSTICS bills_count = ROW_COUNT;

    -- Assign all payments to the target user
    UPDATE payments
    SET user_id = target_user_id
    WHERE user_id IS NULL OR user_id != target_user_id;
    GET DIAGNOSTICS payments_count = ROW_COUNT;

    -- Assign all tenants to the target user
    UPDATE tenants
    SET user_id = target_user_id
    WHERE user_id IS NULL OR user_id != target_user_id;
    GET DIAGNOSTICS tenants_count = ROW_COUNT;

    -- Assign all security deposits to the target user
    -- First ensure the user_id column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'security_deposits' AND column_name = 'user_id') THEN
        UPDATE security_deposits
        SET user_id = target_user_id
        WHERE user_id IS NULL OR user_id != target_user_id;
        GET DIAGNOSTICS security_deposits_count = ROW_COUNT;
    ELSE
        -- If column doesn't exist, add it first
        ALTER TABLE security_deposits ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_security_deposits_user_id ON security_deposits(user_id);
        -- Then assign all records
        UPDATE security_deposits
        SET user_id = target_user_id;
        GET DIAGNOSTICS security_deposits_count = ROW_COUNT;
    END IF;

    -- Show summary
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Data assignment complete!';
    RAISE NOTICE 'Target User ID: %', target_user_id;
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Buildings assigned: %', buildings_count;
    RAISE NOTICE 'Units assigned: %', units_count;
    RAISE NOTICE 'Bills assigned: %', bills_count;
    RAISE NOTICE 'Payments assigned: %', payments_count;
    RAISE NOTICE 'Tenants assigned: %', tenants_count;
    RAISE NOTICE 'Security Deposits assigned: %', security_deposits_count;
    RAISE NOTICE '===========================================';
END $$;

-- ============================================
-- VERIFY THE ASSIGNMENT
-- ============================================

SELECT 
    'Verification' as check_type,
    (SELECT COUNT(*) FROM buildings WHERE user_id = '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as buildings_count,
    (SELECT COUNT(*) FROM units WHERE user_id = '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as units_count,
    (SELECT COUNT(*) FROM bills WHERE user_id = '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as bills_count,
    (SELECT COUNT(*) FROM payments WHERE user_id = '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as payments_count,
    (SELECT COUNT(*) FROM tenants WHERE user_id = '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as tenants_count,
    (SELECT COUNT(*) FROM security_deposits WHERE user_id = '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as security_deposits_count;

-- Show any remaining data that doesn't belong to the target user (should be 0 or empty)
SELECT 
    'Remaining data not assigned to target user' as status,
    (SELECT COUNT(*) FROM buildings WHERE user_id IS NOT NULL AND user_id != '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as other_buildings,
    (SELECT COUNT(*) FROM units WHERE user_id IS NOT NULL AND user_id != '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as other_units,
    (SELECT COUNT(*) FROM bills WHERE user_id IS NOT NULL AND user_id != '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as other_bills,
    (SELECT COUNT(*) FROM payments WHERE user_id IS NOT NULL AND user_id != '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as other_payments,
    (SELECT COUNT(*) FROM tenants WHERE user_id IS NOT NULL AND user_id != '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as other_tenants,
    (SELECT COUNT(*) FROM security_deposits WHERE user_id IS NOT NULL AND user_id != '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as other_security_deposits;

