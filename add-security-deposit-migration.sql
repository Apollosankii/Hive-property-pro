-- Security Deposit Feature Migration
-- Run this in your Supabase SQL Editor

-- Add security_deposit_amount column to units table (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'units' AND column_name = 'security_deposit_amount'
    ) THEN
        ALTER TABLE units 
        ADD COLUMN security_deposit_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;
    END IF;
END $$;

-- Create security_deposit_status enum (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'security_deposit_status') THEN
        CREATE TYPE security_deposit_status AS ENUM ('active', 'refunded', 'forfeited', 'processing');
    END IF;
END $$;

-- Create security_deposits table
CREATE TABLE IF NOT EXISTS security_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  date_deposited DATE NOT NULL DEFAULT CURRENT_DATE,
  total_deductions DECIMAL(10, 2) NOT NULL DEFAULT 0,
  refund_amount DECIMAL(10, 2) GENERATED ALWAYS AS (amount - total_deductions) STORED,
  status security_deposit_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create security_deposit_deductions table for detailed tracking
CREATE TABLE IF NOT EXISTS security_deposit_deductions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  security_deposit_id UUID NOT NULL REFERENCES security_deposits(id) ON DELETE CASCADE,
  deduction_type TEXT NOT NULL CHECK (deduction_type IN ('arrears', 'bills', 'damages', 'other')),
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  bill_id UUID REFERENCES bills(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_security_deposits_tenant ON security_deposits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_deposits_unit ON security_deposits(unit_id);
CREATE INDEX IF NOT EXISTS idx_security_deposits_status ON security_deposits(status);
CREATE INDEX IF NOT EXISTS idx_security_deposit_deductions_deposit ON security_deposit_deductions(security_deposit_id);
CREATE INDEX IF NOT EXISTS idx_security_deposit_deductions_bill ON security_deposit_deductions(bill_id);

-- Enable Row Level Security
ALTER TABLE security_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_deposit_deductions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for security_deposits
DROP POLICY IF EXISTS "Allow all for authenticated users on security_deposits" ON security_deposits;
CREATE POLICY "Allow all for authenticated users on security_deposits"
  ON security_deposits
  FOR ALL
  USING (auth.role() = 'authenticated');

-- RLS Policies for security_deposit_deductions
DROP POLICY IF EXISTS "Allow all for authenticated users on security_deposit_deductions" ON security_deposit_deductions;
CREATE POLICY "Allow all for authenticated users on security_deposit_deductions"
  ON security_deposit_deductions
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Function to update security deposit total_deductions when a deduction is added
CREATE OR REPLACE FUNCTION update_security_deposit_deductions()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE security_deposits
  SET total_deductions = (
    SELECT COALESCE(SUM(amount), 0)
    FROM security_deposit_deductions
    WHERE security_deposit_id = COALESCE(NEW.security_deposit_id, OLD.security_deposit_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.security_deposit_id, OLD.security_deposit_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update total_deductions
DROP TRIGGER IF EXISTS trigger_update_security_deposit_deductions ON security_deposit_deductions;
CREATE TRIGGER trigger_update_security_deposit_deductions
  AFTER INSERT OR UPDATE OR DELETE ON security_deposit_deductions
  FOR EACH ROW
  EXECUTE FUNCTION update_security_deposit_deductions();

-- Function to process security deposit deductions when tenant is deleted
CREATE OR REPLACE FUNCTION process_security_deposit_on_tenant_delete()
RETURNS TRIGGER AS $$
DECLARE
  deposit_record RECORD;
  total_arrears DECIMAL(10, 2);
  last_month_bills DECIMAL(10, 2);
  deduction_amount DECIMAL(10, 2);
  last_month DATE;
BEGIN
  -- Find active security deposit for the deleted tenant
  SELECT * INTO deposit_record
  FROM security_deposits
  WHERE tenant_id = OLD.id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF deposit_record IS NOT NULL THEN
    -- Calculate last month (previous month from current date)
    last_month := DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month');
    
    -- Calculate total arrears (unpaid balances from all bills)
    SELECT COALESCE(SUM(balance), 0) INTO total_arrears
    FROM bills
    WHERE tenant_id = OLD.id
      AND balance > 0;
    
    -- Calculate last month's bills (total amount for last month)
    SELECT COALESCE(SUM(total_amount), 0) INTO last_month_bills
    FROM bills
    WHERE tenant_id = OLD.id
      AND billing_month = last_month;
    
    -- Total deductions = arrears + last month bills
    deduction_amount := total_arrears + last_month_bills;
    
    -- If there are deductions, record them
    IF deduction_amount > 0 THEN
      -- Record arrears deduction
      IF total_arrears > 0 THEN
        INSERT INTO security_deposit_deductions (
          security_deposit_id,
          deduction_type,
          amount,
          description
        ) VALUES (
          deposit_record.id,
          'arrears',
          total_arrears,
          'Automatic deduction: Outstanding arrears at tenant deletion'
        );
      END IF;
      
      -- Record last month bills deduction
      IF last_month_bills > 0 THEN
        INSERT INTO security_deposit_deductions (
          security_deposit_id,
          deduction_type,
          amount,
          description
        ) VALUES (
          deposit_record.id,
          'bills',
          last_month_bills,
          'Automatic deduction: Last month bills at tenant deletion'
        );
      END IF;
      
      -- Update deposit status to 'processing' if deductions were made
      UPDATE security_deposits
      SET status = 'processing',
          notes = COALESCE(notes, '') || E'\n' || 'Processed on tenant deletion. Deductions: ' || deduction_amount,
          updated_at = NOW()
      WHERE id = deposit_record.id;
    END IF;
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to process security deposit when tenant is deleted
DROP TRIGGER IF EXISTS trigger_process_security_deposit_on_tenant_delete ON tenants;
CREATE TRIGGER trigger_process_security_deposit_on_tenant_delete
  BEFORE DELETE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION process_security_deposit_on_tenant_delete();

