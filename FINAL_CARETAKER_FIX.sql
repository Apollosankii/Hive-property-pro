-- FINAL FIX: Ensure Caretaker Portal Works
-- Run this ENTIRE script in Supabase SQL Editor
-- This fixes everything at once

-- ============================================
-- STEP 1: Ensure get_manager_user_id() function exists
-- ============================================

CREATE OR REPLACE FUNCTION get_manager_user_id()
RETURNS UUID AS $$
DECLARE
  manager_id UUID;
BEGIN
  SELECT created_by INTO manager_id
  FROM caretakers
  WHERE user_id = auth.uid() AND status = 'active'
  LIMIT 1;
  
  IF manager_id IS NULL THEN
    RETURN auth.uid();
  END IF;
  
  RETURN manager_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STEP 2: Fix Tenants RLS - Allow Caretakers
-- ============================================

DROP POLICY IF EXISTS "Users can view their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users and caretakers can view tenants" ON tenants;
DROP POLICY IF EXISTS "Users can insert tenants" ON tenants;
DROP POLICY IF EXISTS "Users and caretakers can insert tenants" ON tenants;
DROP POLICY IF EXISTS "Users can update their own tenants" ON tenants;
DROP POLICY IF EXISTS "Users and caretakers can update tenants" ON tenants;
DROP POLICY IF EXISTS "Users can delete their own tenants" ON tenants;
DROP POLICY IF EXISTS "Only managers can delete tenants" ON tenants;

CREATE POLICY "Users and caretakers can view tenants"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.created_by = tenants.user_id
      AND caretakers.status = 'active'
    )
  );

CREATE POLICY "Users and caretakers can insert tenants"
  ON tenants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users and caretakers can update tenants"
  ON tenants FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.created_by = tenants.user_id
      AND caretakers.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.created_by = tenants.user_id
      AND caretakers.status = 'active'
    )
  );

CREATE POLICY "Only managers can delete tenants"
  ON tenants FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id AND
    NOT EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.status = 'active'
    )
  );

-- ============================================
-- STEP 3: Fix Inventory RLS - Allow Caretakers
-- ============================================

DROP POLICY IF EXISTS "Users can view their own inventory" ON inventory;
DROP POLICY IF EXISTS "Users and caretakers can view inventory" ON inventory;
DROP POLICY IF EXISTS "Users can insert inventory" ON inventory;
DROP POLICY IF EXISTS "Users and caretakers can insert inventory" ON inventory;
DROP POLICY IF EXISTS "Users can update their own inventory" ON inventory;
DROP POLICY IF EXISTS "Users and caretakers can update inventory" ON inventory;
DROP POLICY IF EXISTS "Users can delete their own inventory" ON inventory;
DROP POLICY IF EXISTS "Only managers can delete inventory" ON inventory;

CREATE POLICY "Users and caretakers can view inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.created_by = inventory.user_id
      AND caretakers.status = 'active'
    )
  );

CREATE POLICY "Users and caretakers can insert inventory"
  ON inventory FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users and caretakers can update inventory"
  ON inventory FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.created_by = inventory.user_id
      AND caretakers.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.created_by = inventory.user_id
      AND caretakers.status = 'active'
    )
  );

CREATE POLICY "Only managers can delete inventory"
  ON inventory FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id AND
    NOT EXISTS (
      SELECT 1 FROM caretakers 
      WHERE caretakers.user_id = auth.uid() 
      AND caretakers.status = 'active'
    )
  );

-- ============================================
-- STEP 4: Assign Existing Data to Manager
-- ============================================

-- Get manager's user_id from first active caretaker
DO $$
DECLARE
  manager_uuid UUID;
BEGIN
  -- Get manager user_id from first caretaker
  SELECT created_by INTO manager_uuid
  FROM caretakers
  WHERE status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;
  
  -- If no caretaker exists, get from first auth user (fallback)
  IF manager_uuid IS NULL THEN
    SELECT id INTO manager_uuid
    FROM auth.users
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  
  -- Update tenants
  IF manager_uuid IS NOT NULL THEN
    UPDATE tenants
    SET 
      user_id = manager_uuid,
      created_by_user_id = COALESCE(created_by_user_id, manager_uuid),
      modified_by_user_id = COALESCE(modified_by_user_id, manager_uuid)
    WHERE user_id IS NULL AND status = 'active';
    
    -- Update inventory
    UPDATE inventory
    SET 
      user_id = manager_uuid,
      created_by_user_id = COALESCE(created_by_user_id, manager_uuid),
      modified_by_user_id = COALESCE(modified_by_user_id, manager_uuid)
    WHERE user_id IS NULL;
    
    RAISE NOTICE 'Assigned data to manager: %', manager_uuid;
  ELSE
    RAISE NOTICE 'No manager found - data not assigned';
  END IF;
END $$;

-- ============================================
-- STEP 5: Verify Setup
-- ============================================

SELECT 
  'Setup Complete' as status,
  (SELECT COUNT(*) FROM tenants WHERE status = 'active' AND user_id IS NOT NULL) as tenants_with_owner,
  (SELECT COUNT(*) FROM inventory WHERE user_id IS NOT NULL) as inventory_with_owner,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'tenants' AND policyname LIKE '%caretaker%') as tenant_policies,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'inventory' AND policyname LIKE '%caretaker%') as inventory_policies;

