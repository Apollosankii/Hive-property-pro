-- Complete Supabase Setup Script
-- Run this ENTIRE file in your Supabase SQL Editor
-- This includes all tables, policies, and the utilities migration

-- ============================================
-- 1. VERIFY EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 2. VERIFY ENUM TYPES
-- ============================================
DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE unit_status AS ENUM ('occupied', 'vacant');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE bill_status AS ENUM ('pending', 'partial', 'paid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('cash', 'mpesa', 'bank');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 3. CREATE TABLES
-- ============================================

-- Buildings table (must be created first)
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  unit_id UUID,
  id_photo_url TEXT,
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Units table
-- First ensure buildings table exists
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Now create units table with building_id
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID NOT NULL,
  unit_number TEXT NOT NULL,
  monthly_rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  status unit_status NOT NULL DEFAULT 'vacant',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(building_id, unit_number)
);

-- Add foreign key constraint separately to avoid issues
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_units_building'
    ) THEN
        ALTER TABLE units 
        ADD CONSTRAINT fk_units_building 
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Ensure building_id column exists (in case table was created without it)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'units' AND column_name = 'building_id'
    ) THEN
        ALTER TABLE units ADD COLUMN building_id UUID;
        ALTER TABLE units 
        ADD CONSTRAINT fk_units_building 
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add foreign key constraint for tenants.unit_id if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_tenants_unit'
    ) THEN
        ALTER TABLE tenants ADD CONSTRAINT fk_tenants_unit 
        FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Bills table
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  billing_month DATE NOT NULL,
  water_prev_reading DECIMAL(10, 2) NOT NULL DEFAULT 0,
  water_current_reading DECIMAL(10, 2) NOT NULL DEFAULT 0,
  water_units_consumed DECIMAL(10, 2) GENERATED ALWAYS AS (GREATEST(0, water_current_reading - water_prev_reading)) STORED,
  water_rate DECIMAL(10, 2) NOT NULL DEFAULT 50,
  water_amount DECIMAL(10, 2) GENERATED ALWAYS AS (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) STORED,
  elec_prev_reading DECIMAL(10, 2) NOT NULL DEFAULT 0,
  elec_current_reading DECIMAL(10, 2) NOT NULL DEFAULT 0,
  elec_units_consumed DECIMAL(10, 2) GENERATED ALWAYS AS (GREATEST(0, elec_current_reading - elec_prev_reading)) STORED,
  elec_rate DECIMAL(10, 2) NOT NULL DEFAULT 15,
  elec_amount DECIMAL(10, 2) GENERATED ALWAYS AS (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) STORED,
  rent_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  arrears_brought_forward DECIMAL(10, 2) NOT NULL DEFAULT 0,
  garbage_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  maintenance_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  other_utilities_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (
    (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) + 
    (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) + 
    rent_amount + 
    arrears_brought_forward +
    garbage_amount +
    maintenance_amount +
    other_utilities_amount
  ) STORED,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
  balance DECIMAL(10, 2) GENERATED ALWAYS AS (
    (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) + 
    (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) + 
    rent_amount + 
    arrears_brought_forward +
    garbage_amount +
    maintenance_amount +
    other_utilities_amount -
    amount_paid
  ) STORED,
  status bill_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(unit_id, billing_month)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method payment_method NOT NULL,
  receipt_url TEXT,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. ADD UTILITY COLUMNS IF THEY DON'T EXIST
-- ============================================
DO $$ 
BEGIN
    -- Add garbage_amount if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'garbage_amount'
    ) THEN
        ALTER TABLE bills ADD COLUMN garbage_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
    END IF;
    
    -- Add maintenance_amount if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'maintenance_amount'
    ) THEN
        ALTER TABLE bills ADD COLUMN maintenance_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
    END IF;
    
    -- Add other_utilities_amount if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'other_utilities_amount'
    ) THEN
        ALTER TABLE bills ADD COLUMN other_utilities_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- ============================================
-- 5. UPDATE GENERATED COLUMNS TO INCLUDE UTILITIES
-- ============================================
-- Drop and recreate total_amount to include utilities
DO $$ 
BEGIN
    -- Check if total_amount exists and drop it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'total_amount'
    ) THEN
        ALTER TABLE bills DROP COLUMN total_amount;
    END IF;
    
    -- Recreate with utilities
    ALTER TABLE bills ADD COLUMN total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (
      (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) + 
      (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) + 
      rent_amount + 
      arrears_brought_forward +
      COALESCE(garbage_amount, 0) +
      COALESCE(maintenance_amount, 0) +
      COALESCE(other_utilities_amount, 0)
    ) STORED;
END $$;

-- Drop and recreate balance to include utilities
DO $$ 
BEGIN
    -- Check if balance exists and drop it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bills' AND column_name = 'balance'
    ) THEN
        ALTER TABLE bills DROP COLUMN balance;
    END IF;
    
    -- Recreate with utilities
    ALTER TABLE bills ADD COLUMN balance DECIMAL(10, 2) GENERATED ALWAYS AS (
      (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) + 
      (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) + 
      rent_amount + 
      arrears_brought_forward +
      COALESCE(garbage_amount, 0) +
      COALESCE(maintenance_amount, 0) +
      COALESCE(other_utilities_amount, 0) -
      amount_paid
    ) STORED;
END $$;

-- ============================================
-- 6. CREATE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_units_building ON units(building_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
CREATE INDEX IF NOT EXISTS idx_tenants_unit ON tenants(unit_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_bills_unit ON bills(unit_id);
CREATE INDEX IF NOT EXISTS idx_bills_tenant ON bills(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bills_month ON bills(billing_month);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

-- ============================================
-- 7. ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. CREATE RLS POLICIES
-- ============================================
-- Drop existing policies
DROP POLICY IF EXISTS "Allow all for authenticated users on buildings" ON buildings;
DROP POLICY IF EXISTS "Allow all for authenticated users on units" ON units;
DROP POLICY IF EXISTS "Allow all for authenticated users on tenants" ON tenants;
DROP POLICY IF EXISTS "Allow all for authenticated users on bills" ON bills;
DROP POLICY IF EXISTS "Allow all for authenticated users on payments" ON payments;

-- Buildings policies
CREATE POLICY "Allow all for authenticated users on buildings"
  ON buildings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Units policies
CREATE POLICY "Allow all for authenticated users on units"
  ON units FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Tenants policies
CREATE POLICY "Allow all for authenticated users on tenants"
  ON tenants FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Bills policies
CREATE POLICY "Allow all for authenticated users on bills"
  ON bills FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Payments policies
CREATE POLICY "Allow all for authenticated users on payments"
  ON payments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 9. SETUP STORAGE BUCKETS
-- ============================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('tenant-photos', 'tenant-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================
-- 10. STORAGE POLICIES
-- ============================================
DROP POLICY IF EXISTS "Allow authenticated users to upload tenant photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read tenant photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to read receipts" ON storage.objects;

CREATE POLICY "Allow authenticated users to upload tenant photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'tenant-photos');

CREATE POLICY "Allow authenticated users to read tenant photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'tenant-photos');

CREATE POLICY "Allow authenticated users to upload receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Allow authenticated users to read receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipts');

-- ============================================
-- 11. CREATE TRIGGER FUNCTION FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 12. CREATE TRIGGERS
-- ============================================
DROP TRIGGER IF EXISTS update_buildings_updated_at ON buildings;
CREATE TRIGGER update_buildings_updated_at
    BEFORE UPDATE ON buildings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_units_updated_at ON units;
CREATE TRIGGER update_units_updated_at
    BEFORE UPDATE ON units
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Your database is now fully configured with:
-- ✅ All tables created
-- ✅ Utility fields added (garbage, maintenance, other)
-- ✅ RLS policies enabled
-- ✅ Storage buckets configured
-- ✅ Triggers set up
-- ✅ All indexes created

