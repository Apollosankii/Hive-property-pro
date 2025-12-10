-- Caretakers Table and RLS Setup
-- Run this in your Supabase SQL Editor

-- Create caretakers table
CREATE TABLE IF NOT EXISTS caretakers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, -- We'll store a hashed password
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE caretakers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Caretakers are viewable by their creator" ON caretakers;
DROP POLICY IF EXISTS "Caretakers are insertable by their creator" ON caretakers;
DROP POLICY IF EXISTS "Caretakers are updatable by their creator" ON caretakers;
DROP POLICY IF EXISTS "Caretakers are deletable by their creator" ON caretakers;
DROP POLICY IF EXISTS "Caretakers can view their own record" ON caretakers;

-- Create RLS policies
-- Landlords can view caretakers they created
CREATE POLICY "Caretakers are viewable by their creator"
  ON caretakers FOR SELECT
  USING (auth.uid() = created_by);

-- Landlords can insert caretakers
CREATE POLICY "Caretakers are insertable by their creator"
  ON caretakers FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Landlords can update caretakers they created
CREATE POLICY "Caretakers are updatable by their creator"
  ON caretakers FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Landlords can delete caretakers they created
CREATE POLICY "Caretakers are deletable by their creator"
  ON caretakers FOR DELETE
  USING (auth.uid() = created_by);

-- Caretakers can view their own record
CREATE POLICY "Caretakers can view their own record"
  ON caretakers FOR SELECT
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_caretakers_created_by ON caretakers(created_by);
CREATE INDEX IF NOT EXISTS idx_caretakers_user_id ON caretakers(user_id);
CREATE INDEX IF NOT EXISTS idx_caretakers_email ON caretakers(email);

-- Create function to automatically set updated_at
CREATE OR REPLACE FUNCTION update_caretakers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS caretakers_updated_at ON caretakers;
CREATE TRIGGER caretakers_updated_at
  BEFORE UPDATE ON caretakers
  FOR EACH ROW
  EXECUTE FUNCTION update_caretakers_updated_at();

