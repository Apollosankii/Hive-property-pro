import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://givbliycdppmfqeahxss.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdmJsaXljZHBwbWZxZWFoeHNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDk0OTcsImV4cCI6MjA4MDEyNTQ5N30.EKYadRZq_Evt3o-ZDvQTJMZWfLmm2fIAUjwu94Zn1AE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database Types
export interface Tenant {
  id: string
  name: string
  phone: string
  email?: string
  unit_id?: string
  id_photo_url?: string
  status: 'active' | 'inactive'
  created_at: string
}

export interface Building {
  id: string
  name: string
  location: string
  created_at: string
}

export interface Unit {
  id: string
  building_id: string
  unit_number: string
  monthly_rent: number
  tenant_id?: string
  status: 'occupied' | 'vacant'
  created_at: string
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

