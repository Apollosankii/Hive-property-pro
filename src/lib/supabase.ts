import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://givbliycdppmfqeahxss.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdmJsaXljZHBwbWZxZWFoeHNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDk0OTcsImV4cCI6MjA4MDEyNTQ5N30.EKYadRZq_Evt3o-ZDvQTJMZWfLmm2fIAUjwu94Zn1AE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Export supabaseUrl for use in Edge Function calls
export { supabaseUrl }

/**
 * Get the current authenticated user's ID
 * Returns null if no user is authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id || null
}

// Database Types
export interface Tenant {
  id: string
  name: string
  phone: string
  email?: string
  unit_id?: string
  id_photo_url?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relationship?: string
  status: 'active' | 'inactive'
  created_at: string
  created_by_user_id?: string
  modified_by_user_id?: string
}

export interface Building {
  id: string
  name: string
  location: string
  created_at: string
  created_by_user_id?: string
  modified_by_user_id?: string
}

export interface Unit {
  id: string
  building_id: string
  unit_number: string
  monthly_rent: number
  security_deposit_amount?: number
  tenant_id?: string
  status: 'occupied' | 'vacant'
  created_at: string
}

export interface UtilityType {
  id: string
  name: string
  rate: number
  unit_name: string
  description?: string
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface Caretaker {
  id: string
  user_id: string
  created_by: string
  name: string
  phone?: string
  email: string
  password_hash: string
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
  buildings?: Building[] // Assigned buildings
}

export interface CaretakerBuilding {
  id: string
  caretaker_id: string
  building_id: string
  created_at: string
  building?: Building
}

export interface UtilityBillItem {
  id: string
  bill_id: string
  utility_type_id: string
  units_consumed: number
  rate: number
  amount: number
  created_at: string
  utility_types?: UtilityType
}

export interface Employee {
  id: string
  name: string
  phone: string
  email?: string
  position: string
  department?: string
  hire_date: string
  salary_amount: number
  status: 'active' | 'inactive' | 'terminated'
  notes?: string
  created_at: string
  updated_at: string
}

export interface Salary {
  id: string
  employee_id: string
  salary_month: string
  base_salary: number
  bonuses: number
  deductions: number
  total_amount: number
  amount_paid: number
  balance: number
  status: 'pending' | 'paid' | 'partial'
  payment_date?: string
  payment_method?: 'cash' | 'mpesa' | 'bank'
  notes?: string
  created_at: string
  updated_at: string
  employees?: Employee
}

export interface Expense {
  id: string
  description: string
  category: 'maintenance' | 'utilities' | 'supplies' | 'insurance' | 'taxes' | 'legal' | 'marketing' | 'other'
  amount: number
  expense_date: string
  vendor?: string
  receipt_url?: string
  building_id?: string
  unit_id?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Inventory {
  id: string
  item_name: string
  description?: string
  category?: string
  quantity: number
  unit: string
  min_quantity: number
  unit_cost: number
  total_value: number
  status: 'in_stock' | 'low_stock' | 'out_of_stock'
  location?: string
  supplier?: string
  last_restocked?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface InventoryTransaction {
  id: string
  inventory_id: string
  transaction_type: string
  quantity: number
  unit_cost?: number
  total_cost: number
  reference?: string
  notes?: string
  created_at: string
  inventory?: Inventory
}

export interface Bill {
  id: string
  unit_id: string
  tenant_id?: string
  billing_month: string
  water_prev_reading: number
  water_current_reading: number
  water_units_consumed: number
  water_rate: number
  water_amount: number
  elec_prev_reading: number
  elec_current_reading: number
  elec_units_consumed: number
  elec_rate: number
  elec_amount: number
  rent_amount: number
  arrears_brought_forward: number
  total_amount: number
  amount_paid: number
  balance: number
  status: 'pending' | 'partial' | 'paid'
  created_at: string
}

export interface Payment {
  id: string
  bill_id: string
  unit_id: string
  tenant_id: string
  amount: number
  payment_method: 'cash' | 'mpesa' | 'bank'
  receipt_url?: string
  payment_date: string
  notes?: string
  created_at: string
}

export interface SecurityDeposit {
  id: string
  tenant_id: string
  unit_id: string
  amount: number
  date_deposited: string
  total_deductions: number
  refund_amount: number
  status: 'active' | 'refunded' | 'forfeited' | 'processing'
  notes?: string
  created_at: string
  updated_at: string
  tenants?: Tenant
  units?: Unit
}

export interface SecurityDepositDeduction {
  id: string
  security_deposit_id: string
  deduction_type: 'arrears' | 'bills' | 'damages' | 'other'
  amount: number
  description?: string
  bill_id?: string
  created_at: string
  security_deposits?: SecurityDeposit
  bills?: Bill
}

