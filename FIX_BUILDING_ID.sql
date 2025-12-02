-- Fix: Ensure building_id column exists in units table
-- Run this if you get "column building_id does not exist" error

-- Check if units table exists
DO $$ 
BEGIN
    -- Check if units table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'units'
    ) THEN
        -- Check if building_id column exists
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'units' AND column_name = 'building_id'
        ) THEN
            -- Add building_id column
            ALTER TABLE units ADD COLUMN building_id UUID;
            
            -- Add foreign key constraint if buildings table exists
            IF EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'buildings'
            ) THEN
                ALTER TABLE units 
                ADD CONSTRAINT fk_units_building 
                FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
            END IF;
            
            -- Make it NOT NULL if there are no existing rows, or set a default
            -- For existing rows, we'll need to handle this manually
            RAISE NOTICE 'building_id column added to units table';
        ELSE
            RAISE NOTICE 'building_id column already exists in units table';
        END IF;
    ELSE
        RAISE NOTICE 'units table does not exist. Please run COMPLETE_SETUP.sql first.';
    END IF;
END $$;

-- Verify the column exists
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'units' 
  AND column_name = 'building_id';


