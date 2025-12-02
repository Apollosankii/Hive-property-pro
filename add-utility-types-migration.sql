-- Add Utility Types Table for Rate-Based Utilities
-- Run this in your Supabase SQL Editor

-- Create utility_types table
CREATE TABLE IF NOT EXISTS utility_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit_name TEXT NOT NULL DEFAULT 'unit', -- e.g., 'kg', 'bag', 'service', 'unit'
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create utility_bill_items table to store utility consumption per bill
CREATE TABLE IF NOT EXISTS utility_bill_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  utility_type_id UUID NOT NULL REFERENCES utility_types(id) ON DELETE CASCADE,
  units_consumed DECIMAL(10, 2) NOT NULL DEFAULT 0,
  rate DECIMAL(10, 2) NOT NULL, -- Store rate at time of billing
  amount DECIMAL(10, 2) GENERATED ALWAYS AS (units_consumed * rate) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(bill_id, utility_type_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_utility_types_active ON utility_types(is_active);
CREATE INDEX IF NOT EXISTS idx_utility_types_display_order ON utility_types(display_order);
CREATE INDEX IF NOT EXISTS idx_utility_bill_items_bill ON utility_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_utility_bill_items_utility_type ON utility_bill_items(utility_type_id);

-- Enable RLS
ALTER TABLE utility_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_bill_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for utility_types
CREATE POLICY "Users can view utility types" ON utility_types
  FOR SELECT USING (true);

CREATE POLICY "Users can insert utility types" ON utility_types
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update utility types" ON utility_types
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete utility types" ON utility_types
  FOR DELETE USING (true);

-- RLS Policies for utility_bill_items
CREATE POLICY "Users can view utility bill items" ON utility_bill_items
  FOR SELECT USING (true);

CREATE POLICY "Users can insert utility bill items" ON utility_bill_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update utility bill items" ON utility_bill_items
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete utility bill items" ON utility_bill_items
  FOR DELETE USING (true);

-- Add updated_at trigger for utility_types
CREATE OR REPLACE FUNCTION update_utility_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_utility_types_updated_at
  BEFORE UPDATE ON utility_types
  FOR EACH ROW
  EXECUTE FUNCTION update_utility_types_updated_at();

-- Insert some default utility types
INSERT INTO utility_types (name, rate, unit_name, description, display_order) VALUES
  ('Garbage Collection', 500, 'service', 'Monthly garbage collection service', 1),
  ('Cleaning Service', 300, 'service', 'Monthly cleaning service', 2),
  ('Maintenance', 1000, 'service', 'Monthly maintenance fee', 3),
  ('Security', 800, 'service', 'Monthly security service', 4)
ON CONFLICT (name) DO NOTHING;


