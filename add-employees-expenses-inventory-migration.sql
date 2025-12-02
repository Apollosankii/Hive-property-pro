-- Add Employees, Salaries, Expenses, and Inventory Tables
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. CREATE ENUM TYPES
-- ============================================
DO $$ BEGIN
    CREATE TYPE employee_status AS ENUM ('active', 'inactive', 'terminated');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE salary_status AS ENUM ('pending', 'paid', 'partial');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_category AS ENUM ('maintenance', 'utilities', 'supplies', 'insurance', 'taxes', 'legal', 'marketing', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE inventory_status AS ENUM ('in_stock', 'low_stock', 'out_of_stock');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. EMPLOYEES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  position TEXT NOT NULL,
  department TEXT,
  hire_date DATE NOT NULL,
  salary_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status employee_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. SALARIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS salaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  salary_month DATE NOT NULL, -- Format: YYYY-MM-01
  base_salary DECIMAL(10, 2) NOT NULL,
  bonuses DECIMAL(10, 2) NOT NULL DEFAULT 0,
  deductions DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (base_salary + bonuses - deductions) STORED,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
  balance DECIMAL(10, 2) GENERATED ALWAYS AS (base_salary + bonuses - deductions - amount_paid) STORED,
  status salary_status NOT NULL DEFAULT 'pending',
  payment_date DATE,
  payment_method payment_method,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(employee_id, salary_month)
);

-- ============================================
-- 4. EXPENSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  description TEXT NOT NULL,
  category expense_category NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  vendor TEXT,
  receipt_url TEXT,
  building_id UUID REFERENCES buildings(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. INVENTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'unit', -- e.g., 'piece', 'kg', 'liter', 'box'
  min_quantity DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Alert when below this
  unit_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_value DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  status inventory_status GENERATED ALWAYS AS (
    CASE
      WHEN quantity = 0 THEN 'out_of_stock'::inventory_status
      WHEN quantity <= min_quantity THEN 'low_stock'::inventory_status
      ELSE 'in_stock'::inventory_status
    END
  ) STORED,
  location TEXT, -- Where it's stored
  supplier TEXT,
  last_restocked DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 6. INVENTORY TRANSACTIONS TABLE (Track movements)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL, -- 'purchase', 'sale', 'adjustment', 'usage'
  quantity DECIMAL(10, 2) NOT NULL, -- Positive for additions, negative for removals
  unit_cost DECIMAL(10, 2),
  total_cost DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * COALESCE(unit_cost, 0)) STORED,
  reference TEXT, -- Invoice number, work order, etc.
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 7. CREATE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_salaries_employee ON salaries(employee_id);
CREATE INDEX IF NOT EXISTS idx_salaries_month ON salaries(salary_month);
CREATE INDEX IF NOT EXISTS idx_salaries_status ON salaries(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_building ON expenses(building_id);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_inventory ON inventory_transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_type ON inventory_transactions(transaction_type);

-- ============================================
-- 8. ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. RLS POLICIES
-- ============================================
-- Employees
CREATE POLICY "Users can view employees" ON employees FOR SELECT USING (true);
CREATE POLICY "Users can insert employees" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update employees" ON employees FOR UPDATE USING (true);
CREATE POLICY "Users can delete employees" ON employees FOR DELETE USING (true);

-- Salaries
CREATE POLICY "Users can view salaries" ON salaries FOR SELECT USING (true);
CREATE POLICY "Users can insert salaries" ON salaries FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update salaries" ON salaries FOR UPDATE USING (true);
CREATE POLICY "Users can delete salaries" ON salaries FOR DELETE USING (true);

-- Expenses
CREATE POLICY "Users can view expenses" ON expenses FOR SELECT USING (true);
CREATE POLICY "Users can insert expenses" ON expenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update expenses" ON expenses FOR UPDATE USING (true);
CREATE POLICY "Users can delete expenses" ON expenses FOR DELETE USING (true);

-- Inventory
CREATE POLICY "Users can view inventory" ON inventory FOR SELECT USING (true);
CREATE POLICY "Users can insert inventory" ON inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update inventory" ON inventory FOR UPDATE USING (true);
CREATE POLICY "Users can delete inventory" ON inventory FOR DELETE USING (true);

-- Inventory Transactions
CREATE POLICY "Users can view inventory transactions" ON inventory_transactions FOR SELECT USING (true);
CREATE POLICY "Users can insert inventory transactions" ON inventory_transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update inventory transactions" ON inventory_transactions FOR UPDATE USING (true);
CREATE POLICY "Users can delete inventory transactions" ON inventory_transactions FOR DELETE USING (true);

-- ============================================
-- 10. TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_employees_updated_at();

CREATE OR REPLACE FUNCTION update_salaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_salaries_updated_at
  BEFORE UPDATE ON salaries
  FOR EACH ROW
  EXECUTE FUNCTION update_salaries_updated_at();

CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_expenses_updated_at();

CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_updated_at();

-- ============================================
-- 11. TRIGGER TO UPDATE INVENTORY QUANTITY
-- ============================================
CREATE OR REPLACE FUNCTION update_inventory_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update inventory quantity when transaction is created
  UPDATE inventory
  SET quantity = quantity + NEW.quantity,
      last_restocked = CASE WHEN NEW.quantity > 0 THEN CURRENT_DATE ELSE last_restocked END
  WHERE id = NEW.inventory_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inventory_quantity_trigger
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_quantity();

