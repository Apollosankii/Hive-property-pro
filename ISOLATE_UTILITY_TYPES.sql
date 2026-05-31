-- ISOLATE UTILITY TYPES (per-landlord recurring bills)
--
-- Fixes cross-user utility type leakage: one landlord's garbage/security/cleaning
-- charges must not appear in another landlord's settings or generated bills.
--
-- Run in Supabase SQL Editor after ENFORCE_USER_DATA_ISOLATION.sql (or standalone).

BEGIN;

-- 1) user_id columns
ALTER TABLE utility_types ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE utility_bill_items ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_utility_types_user_id ON utility_types(user_id);
CREATE INDEX IF NOT EXISTS idx_utility_bill_items_user_id ON utility_bill_items(user_id);

-- 2) Backfill utility_types.user_id from bill usage (most common owner wins)
UPDATE utility_types ut
SET user_id = sub.owner_id
FROM (
  SELECT
    ubi.utility_type_id,
    b.user_id AS owner_id,
    ROW_NUMBER() OVER (
      PARTITION BY ubi.utility_type_id
      ORDER BY COUNT(*) DESC, b.user_id
    ) AS rn
  FROM utility_bill_items ubi
  JOIN bills b ON b.id = ubi.bill_id
  WHERE b.user_id IS NOT NULL
  GROUP BY ubi.utility_type_id, b.user_id
) sub
WHERE ut.id = sub.utility_type_id
  AND ut.user_id IS NULL
  AND sub.rn = 1;

-- Single-landlord installs: assign remaining orphans to the only building owner
UPDATE utility_types ut
SET user_id = sole.user_id
FROM (
  SELECT user_id
  FROM buildings
  WHERE user_id IS NOT NULL
  GROUP BY user_id
  HAVING COUNT(*) > 0
) sole
WHERE ut.user_id IS NULL
AND (SELECT COUNT(DISTINCT user_id) FROM buildings WHERE user_id IS NOT NULL) = 1;

-- 3) Backfill utility_bill_items.user_id from bills
UPDATE utility_bill_items ubi
SET user_id = b.user_id
FROM bills b
WHERE ubi.bill_id = b.id
  AND b.user_id IS NOT NULL
  AND ubi.user_id IS DISTINCT FROM b.user_id;

-- 4) Auto-assign user_id on INSERT
CREATE OR REPLACE FUNCTION public.tg_set_utility_types_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_set_utility_bill_items_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.bill_id IS NOT NULL THEN
    SELECT b.user_id INTO NEW.user_id FROM bills b WHERE b.id = NEW.bill_id;
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_utility_types_user_id ON utility_types;
CREATE TRIGGER set_utility_types_user_id
  BEFORE INSERT ON utility_types
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_utility_types_user_id();

DROP TRIGGER IF EXISTS set_utility_bill_items_user_id ON utility_bill_items;
CREATE TRIGGER set_utility_bill_items_user_id
  BEFORE INSERT ON utility_bill_items
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_utility_bill_items_user_id();

-- 5) Enable RLS
ALTER TABLE utility_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_bill_items ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies if they exist
DROP POLICY IF EXISTS "Allow all for authenticated users on utility_types" ON utility_types;
DROP POLICY IF EXISTS "Allow all for authenticated users on utility_bill_items" ON utility_bill_items;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON utility_types;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON utility_bill_items;

DROP POLICY IF EXISTS "Users can view their own utility types" ON utility_types;
DROP POLICY IF EXISTS "Users can insert their own utility types" ON utility_types;
DROP POLICY IF EXISTS "Users can update their own utility types" ON utility_types;
DROP POLICY IF EXISTS "Users can delete their own utility types" ON utility_types;

DROP POLICY IF EXISTS "Users can view their own utility bill items" ON utility_bill_items;
DROP POLICY IF EXISTS "Users can insert their own utility bill items" ON utility_bill_items;
DROP POLICY IF EXISTS "Users can update their own utility bill items" ON utility_bill_items;
DROP POLICY IF EXISTS "Users can delete their own utility bill items" ON utility_bill_items;

-- utility_types: strict per-user ownership
CREATE POLICY "Users can view their own utility types"
  ON utility_types FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own utility types"
  ON utility_types FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own utility types"
  ON utility_types FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own utility types"
  ON utility_types FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- utility_bill_items: must belong to user's bill AND user's utility type
CREATE POLICY "Users can view their own utility bill items"
  ON utility_bill_items FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = utility_bill_items.bill_id
        AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own utility bill items"
  ON utility_bill_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bills b
      JOIN utility_types ut ON ut.id = utility_bill_items.utility_type_id
      WHERE b.id = utility_bill_items.bill_id
        AND b.user_id = auth.uid()
        AND ut.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own utility bill items"
  ON utility_bill_items FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = utility_bill_items.bill_id
        AND b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM bills b
      JOIN utility_types ut ON ut.id = utility_bill_items.utility_type_id
      WHERE b.id = utility_bill_items.bill_id
        AND b.user_id = auth.uid()
        AND ut.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own utility bill items"
  ON utility_bill_items FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = utility_bill_items.bill_id
        AND b.user_id = auth.uid()
    )
  );

COMMIT;

-- Diagnostics
SELECT 'utility_types_null_user_id' AS table_name, COUNT(*) AS count
FROM utility_types WHERE user_id IS NULL
UNION ALL
SELECT 'utility_bill_items_null_user_id', COUNT(*)
FROM utility_bill_items WHERE user_id IS NULL;
