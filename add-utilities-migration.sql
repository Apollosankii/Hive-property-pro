-- Migration: Add utility fields to bills table
-- Run this in your Supabase SQL Editor

-- Add utility columns to bills table
ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS garbage_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS maintenance_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_utilities_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Update total_amount generated column to include utilities
ALTER TABLE bills 
DROP COLUMN IF EXISTS total_amount;

ALTER TABLE bills 
ADD COLUMN total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (
  (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) + 
  (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) + 
  rent_amount + 
  arrears_brought_forward +
  garbage_amount +
  maintenance_amount +
  other_utilities_amount
) STORED;

-- Update balance generated column to include utilities
ALTER TABLE bills 
DROP COLUMN IF EXISTS balance;

ALTER TABLE bills 
ADD COLUMN balance DECIMAL(10, 2) GENERATED ALWAYS AS (
  (GREATEST(0, water_current_reading - water_prev_reading) * water_rate) + 
  (GREATEST(0, elec_current_reading - elec_prev_reading) * elec_rate) + 
  rent_amount + 
  arrears_brought_forward +
  garbage_amount +
  maintenance_amount +
  other_utilities_amount -
  amount_paid
) STORED;


