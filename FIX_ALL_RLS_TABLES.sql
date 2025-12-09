-- ============================================
-- MASTER SCRIPT: FIX ALL RLS TABLES AT ONCE
-- ============================================
-- Run this ONE script to fix all tables
-- ============================================

-- List of all tables to fix
DO $$
DECLARE
    tbl_name TEXT;
    func_name TEXT;
    trigger_name TEXT;
    policy_rec RECORD;
    tables TEXT[] := ARRAY[
        'buildings', 'units', 'tenants', 'bills', 'payments',
        'employees', 'salaries', 'expenses', 'inventory', 
        'inventory_transactions', 'security_deposits', 'security_deposit_deductions'
    ];
BEGIN
    FOREACH tbl_name IN ARRAY tables
    LOOP
        -- Add user_id column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = tbl_name
            AND column_name = 'user_id'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE', tbl_name);
        END IF;

        -- Create function to auto-set user_id
        func_name := 'set_' || replace(tbl_name, '-', '_') || '_user_id';
        EXECUTE format('
            CREATE OR REPLACE FUNCTION %I()
            RETURNS TRIGGER AS $trigger$
            BEGIN
                IF NEW.user_id IS NULL THEN
                    NEW.user_id := auth.uid();
                END IF;
                RETURN NEW;
            END;
            $trigger$ LANGUAGE plpgsql SECURITY DEFINER;
        ', func_name);

        -- Drop and create trigger
        trigger_name := func_name || '_trigger';
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, tbl_name);
        EXECUTE format('
            CREATE TRIGGER %I
            BEFORE INSERT ON %I
            FOR EACH ROW
            EXECUTE FUNCTION %I();
        ', trigger_name, tbl_name, func_name);

        -- Enable RLS
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl_name);

        -- Drop all existing policies
        FOR policy_rec IN SELECT policyname FROM pg_policies WHERE tablename = tbl_name
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_rec.policyname, tbl_name);
        END LOOP;

        -- Create policies
        EXECUTE format('
            CREATE POLICY "Users can view their own %I"
            ON %I FOR SELECT
            TO authenticated
            USING (auth.uid() = user_id);
        ', tbl_name, tbl_name);

        EXECUTE format('
            CREATE POLICY "Users can insert %I"
            ON %I FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = COALESCE(user_id, auth.uid()));
        ', tbl_name, tbl_name);

        EXECUTE format('
            CREATE POLICY "Users can update their own %I"
            ON %I FOR UPDATE
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        ', tbl_name, tbl_name);

        EXECUTE format('
            CREATE POLICY "Users can delete their own %I"
            ON %I FOR DELETE
            TO authenticated
            USING (auth.uid() = user_id);
        ', tbl_name, tbl_name);

        -- Create index
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_user_id ON %I(user_id)', tbl_name, tbl_name);

        RAISE NOTICE 'Fixed table: %', tbl_name;
    END LOOP;
END $$;

-- Verify all tables are fixed
SELECT 
    tablename,
    rowsecurity as rls_enabled,
    (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename) as policy_count
FROM pg_tables t
WHERE schemaname = 'public' 
    AND tablename IN (
        'buildings', 'units', 'tenants', 'bills', 'payments',
        'employees', 'salaries', 'expenses', 'inventory', 
        'inventory_transactions', 'security_deposits', 'security_deposit_deductions'
    )
ORDER BY tablename;

SELECT 'All tables fixed!' as status;
