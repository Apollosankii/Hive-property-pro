-- Caretaker Building Assignment Setup
-- Run this in your Supabase SQL Editor
-- This creates the junction table and RLS policies for property assignment

-- Create junction table for caretaker-building assignments
CREATE TABLE IF NOT EXISTS caretaker_buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  caretaker_id UUID NOT NULL REFERENCES caretakers(id) ON DELETE CASCADE,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(caretaker_id, building_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_caretaker_buildings_caretaker ON caretaker_buildings(caretaker_id);
CREATE INDEX IF NOT EXISTS idx_caretaker_buildings_building ON caretaker_buildings(building_id);

-- Enable RLS
ALTER TABLE caretaker_buildings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Landlords can view caretaker building assignments" ON caretaker_buildings;
DROP POLICY IF EXISTS "Landlords can manage caretaker building assignments" ON caretaker_buildings;
DROP POLICY IF EXISTS "Caretakers can view their own building assignments" ON caretaker_buildings;

-- RLS Policies
-- Landlords can view assignments for caretakers they created
CREATE POLICY "Landlords can view caretaker building assignments"
  ON caretaker_buildings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM caretakers
      WHERE caretakers.id = caretaker_buildings.caretaker_id
      AND caretakers.created_by = auth.uid()
    )
  );

-- Landlords can insert/update/delete assignments for their caretakers
CREATE POLICY "Landlords can manage caretaker building assignments"
  ON caretaker_buildings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM caretakers
      WHERE caretakers.id = caretaker_buildings.caretaker_id
      AND caretakers.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM caretakers
      WHERE caretakers.id = caretaker_buildings.caretaker_id
      AND caretakers.created_by = auth.uid()
    )
  );

-- Caretakers can view their own building assignments
CREATE POLICY "Caretakers can view their own building assignments"
  ON caretaker_buildings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM caretakers
      WHERE caretakers.id = caretaker_buildings.caretaker_id
      AND caretakers.user_id = auth.uid()
    )
  );

-- Function to get caretaker's assigned building IDs
CREATE OR REPLACE FUNCTION get_caretaker_buildings(caretaker_user_id UUID)
RETURNS TABLE(building_id UUID) AS $$
BEGIN
  RETURN QUERY
  SELECT cb.building_id
  FROM caretaker_buildings cb
  INNER JOIN caretakers c ON c.id = cb.caretaker_id
  WHERE c.user_id = caretaker_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
