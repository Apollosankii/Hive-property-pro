-- Property Management & Utility Billing PWA - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE tenant_status AS ENUM ('active', 'inactive');
CREATE TYPE unit_status AS ENUM ('occupied', 'vacant');
CREATE TYPE bill_status AS ENUM ('pending', 'partial', 'paid');
CREATE TYPE payment_method AS ENUM ('cash', 'mpesa', 'bank');

-- Buildings table
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenants table (created first to avoid circular dependency)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  unit_id UUID, -- Will add foreign key after units table is created
  id_photo_url TEXT,
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Units table
CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_number TEXT NOT NULL,
  monthly_rent DECIMAL(10, 2) NOT NULL DEFAULT 0,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  status unit_status NOT NULL DEFAULT 'vacant',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(building_id, unit_number)
);

-- Add foreign key constraint for tenants.unit_id after units table is created
ALTER TABLE tenants ADD CONSTRAINT fk_tenants_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;

-- Bills table
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  billing_month DATE NOT NULL, -- Format: YYYY-MM-01
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

-- Payments table
CREATE TABLE payments (
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

-- Create indexes for better performance
CREATE INDEX idx_units_building ON units(building_id);
CREATE INDEX idx_units_tenant ON units(tenant_id);
CREATE INDEX idx_units_status ON units(status);
CREATE INDEX idx_tenants_unit ON tenants(unit_id);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_bills_unit ON bills(unit_id);
CREATE INDEX idx_bills_tenant ON bills(tenant_id);
CREATE INDEX idx_bills_month ON bills(billing_month);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_payments_bill ON payments(bill_id);
CREATE INDEX idx_payments_tenant ON payments(tenant_id);
CREATE INDEX idx_payments_date ON payments(payment_date);

-- Enable Row Level Security
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (adjust based on your auth requirements)
-- For now, allow all operations for authenticated users
-- In production, add user_id to tables and filter by user
-- Drop existing policies first to avoid errors

DROP POLICY IF EXISTS "Allow all for authenticated users on buildings" ON buildings;
DROP POLICY IF EXISTS "Allow all for authenticated users on units" ON units;
DROP POLICY IF EXISTS "Allow all for authenticated users on tenants" ON tenants;
DROP POLICY IF EXISTS "Allow all for authenticated users on bills" ON bills;
DROP POLICY IF EXISTS "Allow all for authenticated users on payments" ON payments;

CREATE POLICY "Allow all for authenticated users on buildings"
  ON buildings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on units"
  ON units FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on tenants"
  ON tenants FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on bills"
  ON bills FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for authenticated users on payments"
  ON payments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create storage buckets for file uploads (if they don't exist)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('tenant-photos', 'tenant-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop if exists first to avoid errors)
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

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_buildings_updated_at BEFORE UPDATE ON buildings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

