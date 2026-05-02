-- Per-building payment instructions (M-Pesa / bank). Run in Supabase SQL Editor.
-- Use ONLY this script on an existing database. Do not re-run supabase-schema.sql from the top
-- (it would recreate types/tables); this file is idempotent via IF NOT EXISTS.
-- Nullable fields: when all empty, app falls back to global app-settings.

ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS payment_method_label TEXT,
  ADD COLUMN IF NOT EXISTS payment_paybill TEXT,
  ADD COLUMN IF NOT EXISTS payment_account_number TEXT,
  ADD COLUMN IF NOT EXISTS payment_notes TEXT;

COMMENT ON COLUMN buildings.payment_method_label IS 'e.g. M-Pesa, Bank transfer';
COMMENT ON COLUMN buildings.payment_paybill IS 'Paybill or till number';
COMMENT ON COLUMN buildings.payment_account_number IS 'Account number or pay-to phone';
COMMENT ON COLUMN buildings.payment_notes IS 'Optional short instructions for tenants';
