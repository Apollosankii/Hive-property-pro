-- Add lease tracking to tenants table
-- This migration adds lease_start and lease_end dates to track tenant lease periods

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lease_start DATE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lease_end DATE;

-- Create index on lease dates for faster queries
CREATE INDEX IF NOT EXISTS idx_tenants_lease_start ON tenants(lease_start);
CREATE INDEX IF NOT EXISTS idx_tenants_lease_end ON tenants(lease_end);

-- Add lease_end_processed flag to track if lease end settlement has been completed
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lease_end_processed BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lease_end_notes TEXT;

-- Create a table to record lease end settlements for historical tracking
CREATE TABLE IF NOT EXISTS lease_end_settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lease_end_date DATE NOT NULL,
  total_arrears DECIMAL(10, 2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_deductible DECIMAL(10, 2) NOT NULL DEFAULT 0,
  amount_to_refund DECIMAL(10, 2) NOT NULL DEFAULT 0,
  settlement_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lease_settlements_tenant ON lease_end_settlements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lease_settlements_unit ON lease_end_settlements(unit_id);
CREATE INDEX IF NOT EXISTS idx_lease_settlements_date ON lease_end_settlements(lease_end_date);

-- Enable RLS for lease_end_settlements table
ALTER TABLE lease_end_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users on lease_end_settlements"
  ON lease_end_settlements FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create trigger to update updated_at on lease_end_settlements
CREATE TRIGGER update_lease_end_settlements_updated_at BEFORE UPDATE ON lease_end_settlements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
