-- Add a separate advance payments table to track tenant credit/overpayments that are applied to future bills.

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

CREATE INDEX IF NOT EXISTS idx_advance_payments_unit ON advance_payments(unit_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_tenant ON advance_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_target_month ON advance_payments(target_month);
CREATE INDEX IF NOT EXISTS idx_advance_payments_applied_bill ON advance_payments(applied_bill_id);
CREATE INDEX IF NOT EXISTS idx_advance_payments_user_id ON advance_payments(user_id);

ALTER TABLE advance_payments ENABLE ROW LEVEL SECURITY;

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
