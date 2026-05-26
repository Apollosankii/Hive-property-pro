-- Property Management & Utility Billing PWA - Database Schema
-- Run this in your Supabase SQL Editor.
--
-- Re-runnable (fresh project): safe to run multiple times on an empty DB.
-- Existing Supabase project: if tables already exist, this file will SKIP creating them
-- (it will NOT add new columns to old tables). For new columns only, run instead:
--   ADD_BUILDING_PAYMENT_COLUMNS.sql
-- and any other small migrations in this repo.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types (safe to re-run)
DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE unit_status AS ENUM ('occupied', 'vacant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE bill_status AS ENUM ('pending', 'partial', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'mpesa', 'bank');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Buildings table
CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method_label TEXT,
  payment_paybill TEXT,
  payment_account_number TEXT,
  payment_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenants (FK to units added below after units exists)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  unit_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  id_photo_url TEXT,
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  monthly_rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  status unit_status NOT NULL DEFAULT 'vacant',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(building_id, unit_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_tenants_unit'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT fk_tenants_unit
      FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  billing_month DATE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
  total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (
    (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) +
    (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) +
    rent_amount +
    arrears_brought_forward
  ) STORED,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
  balance DECIMAL(10, 2) GENERATED ALWAYS AS (
    (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) +
    (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) +
    rent_amount +
    arrears_brought_forward -
    amount_paid
  ) STORED,
  status bill_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(unit_id, billing_month)
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method payment_method NOT NULL,
  receipt_url TEXT,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS advance_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_month DATE NOT NULL,
  applied_bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method payment_method NOT NULL,
  receipt_url TEXT,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  notes TEXT,
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);

CREATE INDEX IF NOT EXISTS idx_advance_payments_unit ON advance_payments(unit_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_tenant ON advance_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_target_month ON advance_payments(target_month);
CREATE INDEX IF NOT EXISTS idx_advance_payments_applied_bill ON advance_payments(applied_bill_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_user_id ON advance_payments(user_id);

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- IMPORTANT:
-- This project is multi-tenant (per-landlord). Do NOT use permissive policies like USING(true).
-- For existing DBs, run ENFORCE_USER_DATA_ISOLATION.sql to backfill user_id and set policies.

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

CREATE POLICY "Users can view their own advance payments"
  ON advance_payments FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = advance_payments.unit_id AND u.user_id = auth.uid())
  );
CREATE POLICY "Users can insert their own advance payments"
  ON advance_payments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = advance_payments.unit_id AND u.user_id = auth.uid())
  );
CREATE POLICY "Users can update their own advance payments"
  ON advance_payments FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = advance_payments.unit_id AND u.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = advance_payments.unit_id AND u.user_id = auth.uid())
  );
CREATE POLICY "Users can delete their own advance payments"
  ON advance_payments FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM units u WHERE u.id = advance_payments.unit_id AND u.user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-photos', 'tenant-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

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

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_buildings_updated_at'
  ) THEN
    CREATE TRIGGER update_buildings_updated_at
      BEFORE UPDATE ON buildings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_units_updated_at'
  ) THEN
    CREATE TRIGGER update_units_updated_at
      BEFORE UPDATE ON units
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_tenants_updated_at'
  ) THEN
    CREATE TRIGGER update_tenants_updated_at
      BEFORE UPDATE ON tenants
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_bills_updated_at'
  ) THEN
    CREATE TRIGGER update_bills_updated_at
      BEFORE UPDATE ON bills
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
