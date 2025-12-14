-- UPDATE NULL USER IDs IN BUILDINGS TABLE
-- This script updates all buildings with NULL user_id to user ID: 373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe
-- Run this script in your Supabase SQL Editor

-- ============================================
-- STEP 1: ENSURE user_id COLUMN EXISTS
-- ============================================

-- Add user_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'buildings' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE buildings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_buildings_user_id ON buildings(user_id);
        RAISE NOTICE 'user_id column added to buildings table';
    ELSE
        RAISE NOTICE 'user_id column already exists in buildings table';
    END IF;
END $$;

-- ============================================
-- STEP 2: UPDATE NULL USER IDs
-- ============================================

DO $$
DECLARE
    target_user_id UUID := '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe';
    updated_count INTEGER;
    total_buildings INTEGER;
    null_count INTEGER;
BEGIN
    -- Count total buildings
    SELECT COUNT(*) INTO total_buildings FROM buildings;
    
    -- Count buildings with NULL user_id
    SELECT COUNT(*) INTO null_count FROM buildings WHERE user_id IS NULL;
    
    RAISE NOTICE 'Found % buildings with NULL user_id', null_count;
    
    -- Update buildings with NULL user_id
    UPDATE buildings
    SET user_id = target_user_id
    WHERE user_id IS NULL;
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- Show summary
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Update Complete!';
    RAISE NOTICE 'Target User ID: %', target_user_id;
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Total buildings in table: %', total_buildings;
    RAISE NOTICE 'Buildings with NULL user_id updated: %', updated_count;
    RAISE NOTICE '===========================================';
END $$;

-- ============================================
-- VERIFY THE UPDATE
-- ============================================

-- Show buildings by user_id status
SELECT 
    'Buildings Summary' as status,
    COUNT(*) FILTER (WHERE user_id IS NULL) as null_user_ids,
    COUNT(*) FILTER (WHERE user_id = '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as assigned_to_target_user,
    COUNT(*) FILTER (WHERE user_id IS NOT NULL AND user_id != '373c87ce-7a1b-4e7a-8ea6-2cce879ea8fe') as assigned_to_other_users,
    COUNT(*) as total_buildings
FROM buildings;

