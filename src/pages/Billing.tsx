import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatMonth } from '@/lib/utils'
import { generateInvoicePDF, generateBulkInvoicesPDF } from '@/lib/pdf'
import { exportBillsToExcel } from '@/lib/excel'
import { importBillsFromFile } from '@/lib/excel-import'
import { Plus, Calendar, CheckCircle, Receipt, Edit, FileText, AlertCircle, X, Printer, FileSpreadsheet, Upload } from 'lucide-react'

export default function Billing() {
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [showMeterModal, setShowMeterModal] = useState(false)
  const [showEditBillModal, setShowEditBillModal] = useState(false)
  const [showCreateBillModal, setShowCreateBillModal] = useState(false)
  const [showCreateUtilityBillModal, setShowCreateUtilityBillModal] = useState(false)
  const [editingBill, setEditingBill] = useState<any>(null)
  const [selectedUnitForBill, setSelectedUnitForBill] = useState<string>('')
  const [meterReadings, setMeterReadings] = useState<Record<string, {
    water_prev: number
    water_current: number
    elec_prev: number
    elec_current: number
  }>>({})
  const [billFormData, setBillFormData] = useState({
    water_prev_reading: '',
    water_current_reading: '',
    water_rate: '50',
    elec_prev_reading: '',
    elec_current_reading: '',
    elec_rate: '15',
    rent_amount: '',
    arrears_brought_forward: '',
    garbage_amount: '',
    maintenance_amount: '',
    other_utilities_amount: '',
    amount_paid: '',
  })
  // Utility consumptions state (for future utility types integration)
  // const [utilityConsumptions, setUtilityConsumptions] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [importMessage, setImportMessage] = useState('')
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null)
  const queryClient = useQueryClient()

  const { data: bills, error: billsError, isLoading: billsLoading } = useQuery({
    queryKey: ['bills', selectedMonth],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      const monthStart = selectedMonth + '-01'
      const nextMonth = new Date(monthStart)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const monthEnd = nextMonth.toISOString().slice(0, 10)

      // Fetch bills first
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .gte('billing_month', monthStart)
        .lt('billing_month', monthEnd)
        .order('created_at', { ascending: false })
      
      if (billsError) {
        console.error('Bills query error:', billsError)
        throw billsError
      }
      
      if (!billsData || billsData.length === 0) {
        console.log('No bills found for', selectedMonth)
        return []
      }
      
      console.log('Bills fetched:', billsData.length, 'bills')
      
      // Fetch units and tenants separately
      const billsWithRelations = await Promise.all(
        billsData.map(async (bill: any) => {
          const [unitRes, tenantRes] = await Promise.all([
            bill.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', bill.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            bill.tenant_id
              ? supabase
                  .from('tenants')
                  .select('name')
                  .eq('id', bill.tenant_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          // Get building name if unit found
          let buildingName = null
          if (unitRes.data?.building_id) {
            const { data: buildingData } = await supabase
              .from('buildings')
              .select('name')
              .eq('id', unitRes.data.building_id)
              .single()
            
            buildingName = buildingData?.name || null
          }
          
          return {
            ...bill,
            units: unitRes.data ? {
              unit_number: unitRes.data.unit_number,
              buildings: buildingName ? { name: buildingName } : null
            } : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null
          }
        })
      )
      
      return billsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: occupiedUnits, error: occupiedUnitsError } = useQuery({
    queryKey: ['occupied-units'],
    queryFn: async () => {
      // Check authentication first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch occupied units first
      const { data: unitsData, error: unitsError } = await supabase
        .from('units')
        .select('*')
        .eq('status', 'occupied')
        .order('unit_number')
      
      if (unitsError) {
        console.error('Occupied units query error:', unitsError)
        throw unitsError
      }
      
      if (!unitsData || unitsData.length === 0) {
        console.log('No occupied units found')
        return []
      }
      
      console.log('Occupied units fetched:', unitsData.length, 'units')
      
      // Fetch buildings and tenants separately for each unit
      const unitsWithRelations = await Promise.all(
        unitsData.map(async (unit: any) => {
          const [buildingRes, tenantRes] = await Promise.all([
            unit.building_id
              ? supabase.from('buildings').select('name').eq('id', unit.building_id).single()
              : Promise.resolve({ data: null, error: null }),
            unit.tenant_id
              ? supabase.from('tenants').select('id, name').eq('id', unit.tenant_id).single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          return {
            id: unit.id,
            unit_number: unit.unit_number,
            monthly_rent: unit.monthly_rent,
            buildings: buildingRes.data ? { name: buildingRes.data.name } : null,
            tenants: tenantRes.data ? { id: tenantRes.data.id, name: tenantRes.data.name } : null
          }
        })
      )
      
      return unitsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  // Query to get all units for creating a single bill
  const { data: allUnits } = useQuery({
    queryKey: ['all-units'],
    queryFn: async () => {
      const { data: unitsData, error } = await supabase
        .from('units')
        .select('id, unit_number, monthly_rent, building_id, tenant_id, status')
        .order('unit_number')
      
      if (error) throw error
      
      // Fetch buildings and tenants separately
      const unitsWithRelations = await Promise.all(
        (unitsData || []).map(async (unit: any) => {
          const [buildingRes, tenantRes] = await Promise.all([
            unit.building_id
              ? supabase.from('buildings').select('name').eq('id', unit.building_id).single()
              : Promise.resolve({ data: null, error: null }),
            unit.tenant_id
              ? supabase.from('tenants').select('id, name').eq('id', unit.tenant_id).single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          return {
            ...unit,
            buildings: buildingRes.data ? { name: buildingRes.data.name } : null,
            tenants: tenantRes.data ? { id: tenantRes.data.id, name: tenantRes.data.name } : null
          }
        })
      )
      
      return unitsWithRelations
    },
  })

  // Fetch active utility types
  const { data: activeUtilityTypes } = useQuery({
    queryKey: ['active-utility-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('utility_types')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      
      if (error) {
        console.error('Error fetching active utility types:', error)
        throw error
      }
      
      console.log('✅ Fetched active utility types from database:', data)
      return data || []
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const generateBillsMutation = useMutation({
    mutationFn: async () => {
      if (!occupiedUnits) return

      // AUTOMATIC ARREARS CALCULATION:
      // The system automatically calculates and carries forward arrears from the previous month.
      // How it works:
      // 1. Gets the previous month's bills
      // 2. Uses the balance field (automatically calculated by database as: total_amount - amount_paid)
      // 3. Sets that balance as arrears_brought_forward for the new month's bills
      // Example: If January bill was 10,000 and only 9,000 was paid, 
      //          the remaining 1,000 automatically becomes arrears in February's bill.
      const prevMonth = new Date(selectedMonth + '-01')
      prevMonth.setMonth(prevMonth.getMonth() - 1)
      const prevMonthStr = prevMonth.toISOString().slice(0, 7) + '-01'

      console.log('Calculating arrears from previous month:', prevMonthStr)

      const { data: prevBills } = await supabase
        .from('bills')
        .select('unit_id, balance, total_amount, amount_paid')
        .eq('billing_month', prevMonthStr)

      // Use balance (which is automatically calculated by database: total_amount - amount_paid) as arrears
      // This ensures that if 9000 was paid on a 10000 bill, the remaining 1000 automatically becomes arrears
      const prevBalances = new Map(
        prevBills?.map((b) => {
          const arrears = Math.max(0, b.balance || 0)
          if (arrears > 0) {
            console.log(`Unit ${b.unit_id}: Previous balance ${b.balance} will be carried forward as arrears`)
          }
          return [b.unit_id, arrears]
        }) || []
      )

      const totalArrears = Array.from(prevBalances.values()).reduce((sum, val) => sum + val, 0)
      if (totalArrears > 0) {
        console.log(`Total arrears to be carried forward: ${totalArrears}`)
      }

      // Get previous month's meter readings
      const { data: prevMonthBills } = await supabase
        .from('bills')
        .select('unit_id, water_current_reading, elec_current_reading')
        .eq('billing_month', prevMonthStr)

      const prevMeterReadings = new Map(
        prevMonthBills?.map((b) => [
          b.unit_id,
          {
            water: b.water_current_reading || 0,
            elec: b.elec_current_reading || 0,
          },
        ]) || []
      )

      // Default rates (can be moved to settings)
      const defaultWaterRate = 50
      const defaultElecRate = 15

      // Calculate utility amounts from active utility types ONLY
      // For fixed-rate utilities, the rate IS the amount (no units calculation needed)
      let garbageAmount = 0
      let maintenanceAmount = 0
      let otherUtilitiesAmount = 0
      
      if (activeUtilityTypes && activeUtilityTypes.length > 0) {
        console.log('Bulk generation - Active utility types:', activeUtilityTypes)
        activeUtilityTypes.forEach((utility: any) => {
          const utilityName = utility.name.toLowerCase().trim()
          const utilityRate = utility.rate || 0
          
          console.log(`Processing utility: ${utility.name}, Rate: ${utilityRate}`)
          
          // Map utilities to the correct bill columns based on name matching
          if (utilityName.includes('garbage')) {
            garbageAmount = utilityRate
          } else if (utilityName.includes('maintenance')) {
            maintenanceAmount = utilityRate
          } else {
            // All other active utilities
            otherUtilitiesAmount += utilityRate
          }
        })
        
        console.log('Bulk generation - Final amounts:', { garbageAmount, maintenanceAmount, otherUtilitiesAmount })
      }

      const billsToInsert = occupiedUnits.map((unit: any) => {
        const readings = meterReadings[unit.id] || {
          water_prev: prevMeterReadings.get(unit.id)?.water || 0,
          water_current: prevMeterReadings.get(unit.id)?.water || 0,
          elec_prev: prevMeterReadings.get(unit.id)?.elec || 0,
          elec_current: prevMeterReadings.get(unit.id)?.elec || 0,
        }

        const arrears = prevBalances.get(unit.id) || 0
        // Note: water_units_consumed, water_amount, elec_units_consumed, elec_amount, 
        // total_amount, and balance are all generated columns, calculated automatically by the database

        return {
          unit_id: unit.id,
          tenant_id: unit.tenants?.id || null,
          billing_month: selectedMonth + '-01', // Convert YYYY-MM to YYYY-MM-01 for DATE type
          water_prev_reading: readings.water_prev,
          water_current_reading: readings.water_current,
          // Note: water_units_consumed, water_amount are generated columns
          water_rate: defaultWaterRate,
          elec_prev_reading: readings.elec_prev,
          elec_current_reading: readings.elec_current,
          // Note: elec_units_consumed, elec_amount are generated columns
          elec_rate: defaultElecRate,
          rent_amount: unit.monthly_rent || 0,
          arrears_brought_forward: arrears,
          garbage_amount: garbageAmount,
          maintenance_amount: maintenanceAmount,
          other_utilities_amount: otherUtilitiesAmount,
          // Note: total_amount, balance are generated columns
          amount_paid: 0,
          status: 'pending' as const,
        }
      })

      const { data: insertedBills, error: billsError } = await supabase
        .from('bills')
        .insert(billsToInsert)
        .select()
      
      if (billsError) throw billsError

      // Create utility_bill_items for each bill and active utility type
      if (insertedBills && activeUtilityTypes && activeUtilityTypes.length > 0) {
        const utilityBillItems = []
        for (const bill of insertedBills) {
          for (const utility of activeUtilityTypes) {
            // For fixed-rate utilities, use 1 unit by default
            const units = 1
            utilityBillItems.push({
              bill_id: bill.id,
              utility_type_id: utility.id,
              units_consumed: units,
              rate: utility.rate,
            })
          }
        }

        if (utilityBillItems.length > 0) {
          const { error: utilityItemsError } = await supabase
            .from('utility_bill_items')
            .insert(utilityBillItems)
          
          if (utilityItemsError) {
            console.error('Failed to create utility bill items:', utilityItemsError)
            // Don't throw - bills were created successfully, utility items are supplementary
          }
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.refetchQueries({ queryKey: ['bills'] })
      await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] })
      setIsGenerating(false)
      setShowMeterModal(false)
      setMeterReadings({})
    },
    onError: (error: any) => {
      console.error('Failed to generate bills:', error)
      setIsGenerating(false)
      alert(error.message || 'Failed to generate bills. Please check your Supabase configuration.')
    },
  })

  const handleGenerateBills = () => {
    if (occupiedUnitsError) {
      alert(`Error loading occupied units: ${occupiedUnitsError.message || 'Please check your Supabase configuration and ensure you are logged in.'}`)
      return
    }
    
    if (!occupiedUnits || occupiedUnits.length === 0) {
      alert('No occupied units found. Please assign tenants to units first.')
      return
    }
    setShowMeterModal(true)
  }

  const handleGenerate = () => {
    setIsGenerating(true)
    generateBillsMutation.mutate()
  }

  // Edit bill mutation
  const updateBillMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string, updates: any }) => {
      const { error } = await supabase
        .from('bills')
        .update(updates)
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.refetchQueries({ queryKey: ['bills'] })
      await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] })
      setShowEditBillModal(false)
      setEditingBill(null)
      setError(null)
      setBillFormData({
        water_prev_reading: '',
        water_current_reading: '',
        water_rate: '50',
        elec_prev_reading: '',
        elec_current_reading: '',
        elec_rate: '15',
        rent_amount: '',
        arrears_brought_forward: '',
        garbage_amount: '',
        maintenance_amount: '',
        other_utilities_amount: '',
        amount_paid: '',
      })
    },
    onError: (error: any) => {
      console.error('Failed to update bill:', error)
      setError(error.message || 'Failed to update bill. Please check your Supabase configuration.')
    },
  })

  // Create single bill mutation
  const createBillMutation = useMutation({
    mutationFn: async (billData: any) => {
      const { error } = await supabase
        .from('bills')
        .insert([billData])
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.refetchQueries({ queryKey: ['bills'] })
      await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] })
      setShowCreateBillModal(false)
      setSelectedUnitForBill('')
      setError(null)
      setBillFormData({
        water_prev_reading: '',
        water_current_reading: '',
        water_rate: '50',
        elec_prev_reading: '',
        elec_current_reading: '',
        elec_rate: '15',
        rent_amount: '',
        arrears_brought_forward: '',
        garbage_amount: '0',
        maintenance_amount: '0',
        other_utilities_amount: '0',
        amount_paid: '0',
      })
    },
    onError: (error: any) => {
      console.error('Failed to create bill:', error)
      setError(error.message || 'Failed to create bill. Please check your Supabase configuration.')
    },
  })

  // Create utility-only bill mutation
  const createUtilityBillMutation = useMutation({
    mutationFn: async (billData: any) => {
      const { error } = await supabase
        .from('bills')
        .insert([billData])
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.refetchQueries({ queryKey: ['bills'] })
      await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] })
      setShowCreateUtilityBillModal(false)
      setSelectedUnitForBill('')
      setError(null)
      setBillFormData({
        water_prev_reading: '',
        water_current_reading: '',
        water_rate: '50',
        elec_prev_reading: '',
        elec_current_reading: '',
        elec_rate: '15',
        rent_amount: '',
        arrears_brought_forward: '',
        garbage_amount: '',
        maintenance_amount: '',
        other_utilities_amount: '',
        amount_paid: '0',
      })
    },
    onError: (error: any) => {
      console.error('Failed to create utility bill:', error)
      setError(error.message || 'Failed to create utility bill. Please check your Supabase configuration.')
    },
  })

  const handleEditBill = (bill: any) => {
    setEditingBill(bill)
    setBillFormData({
      water_prev_reading: bill.water_prev_reading?.toString() || '',
      water_current_reading: bill.water_current_reading?.toString() || '',
      water_rate: bill.water_rate?.toString() || '50',
      elec_prev_reading: bill.elec_prev_reading?.toString() || '',
      elec_current_reading: bill.elec_current_reading?.toString() || '',
      elec_rate: bill.elec_rate?.toString() || '15',
      rent_amount: bill.rent_amount?.toString() || '',
      arrears_brought_forward: bill.arrears_brought_forward?.toString() || '',
      garbage_amount: bill.garbage_amount?.toString() || '0',
      maintenance_amount: bill.maintenance_amount?.toString() || '0',
      other_utilities_amount: bill.other_utilities_amount?.toString() || '0',
      amount_paid: bill.amount_paid?.toString() || '0',
    })
    setShowEditBillModal(true)
  }

  const handleCreateBill = () => {
    setSelectedUnitForBill('')
    
    // Auto-fill utility amounts from active utility types when modal opens
    let garbageAmount = '0'
    let maintenanceAmount = '0'
    let otherUtilitiesAmount = '0'
    
    if (activeUtilityTypes && activeUtilityTypes.length > 0) {
      console.log('🔍 handleCreateBill - Active utility types found:', activeUtilityTypes)
      activeUtilityTypes.forEach((utility: any) => {
        const utilityName = utility.name.toLowerCase().trim()
        const utilityRate = parseFloat(utility.rate) || 0
        
        console.log(`  📋 Checking utility: "${utility.name}" -> normalized: "${utilityName}", rate: ${utilityRate}, is_active: ${utility.is_active}`)
        
        if (utilityName.includes('garbage')) {
          garbageAmount = utilityRate.toString()
          console.log(`    ✅ Setting garbage_amount to ${garbageAmount}`)
        } else if (utilityName.includes('maintenance')) {
          maintenanceAmount = utilityRate.toString()
          console.log(`    ✅ Setting maintenance_amount to ${maintenanceAmount}`)
        } else {
          const currentOther = parseFloat(otherUtilitiesAmount || '0')
          otherUtilitiesAmount = (currentOther + utilityRate).toString()
          console.log(`    ✅ Adding to other_utilities_amount: ${otherUtilitiesAmount}`)
        }
      })
    } else {
      console.log('⚠️ handleCreateBill - No active utility types found')
    }
    
    console.log('💰 handleCreateBill - Final amounts:', { garbageAmount, maintenanceAmount, otherUtilitiesAmount })
    
    setBillFormData({
      water_prev_reading: '',
      water_current_reading: '',
      water_rate: '50',
      elec_prev_reading: '',
      elec_current_reading: '',
      elec_rate: '15',
      rent_amount: '',
      arrears_brought_forward: '',
      garbage_amount: garbageAmount,
      maintenance_amount: maintenanceAmount,
      other_utilities_amount: otherUtilitiesAmount,
      amount_paid: '0',
    })
    setShowCreateBillModal(true)
  }

  const handleSaveEditBill = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!editingBill) return

    const amountPaid = parseFloat(billFormData.amount_paid) || 0
    // Calculate new balance: total_amount - amount_paid (balance is generated, but we need to check status)
    // We'll calculate total from the form data
    const waterUnits = Math.max(0, (parseFloat(billFormData.water_current_reading) || 0) - (parseFloat(billFormData.water_prev_reading) || 0))
    const elecUnits = Math.max(0, (parseFloat(billFormData.elec_current_reading) || 0) - (parseFloat(billFormData.elec_prev_reading) || 0))
    const waterAmount = waterUnits * (parseFloat(billFormData.water_rate) || 50)
    const elecAmount = elecUnits * (parseFloat(billFormData.elec_rate) || 15)
    const rentAmount = parseFloat(billFormData.rent_amount) || 0
    const arrears = parseFloat(billFormData.arrears_brought_forward) || 0
    const garbageAmount = parseFloat(billFormData.garbage_amount) || 0
    const maintenanceAmount = parseFloat(billFormData.maintenance_amount) || 0
    const otherUtilitiesAmount = parseFloat(billFormData.other_utilities_amount) || 0
    const totalAmount = waterAmount + elecAmount + rentAmount + arrears + garbageAmount + maintenanceAmount + otherUtilitiesAmount
    const newBalance = totalAmount - amountPaid
    const newStatus = newBalance <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'pending'

    const updates = {
      water_prev_reading: parseFloat(billFormData.water_prev_reading) || 0,
      water_current_reading: parseFloat(billFormData.water_current_reading) || 0,
      water_rate: parseFloat(billFormData.water_rate) || 50,
      elec_prev_reading: parseFloat(billFormData.elec_prev_reading) || 0,
      elec_current_reading: parseFloat(billFormData.elec_current_reading) || 0,
      elec_rate: parseFloat(billFormData.elec_rate) || 15,
      rent_amount: parseFloat(billFormData.rent_amount) || 0,
      arrears_brought_forward: parseFloat(billFormData.arrears_brought_forward) || 0,
      garbage_amount: garbageAmount,
      maintenance_amount: maintenanceAmount,
      other_utilities_amount: otherUtilitiesAmount,
      amount_paid: amountPaid,
      status: newStatus,
    }

    updateBillMutation.mutate({ id: editingBill.id, updates })
  }

  const handleSaveCreateBill = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedUnitForBill) {
      setError('Please select a unit')
      return
    }

    const selectedUnit = allUnits?.find((u: any) => u.id === selectedUnitForBill)
    if (!selectedUnit) {
      setError('Selected unit not found')
      return
    }

    // Calculate utility amounts from active utility types ONLY
    // Use the values from the form (which were auto-filled from active utilities)
    // This ensures we only use active utilities and their exact rates
    let garbageAmount = parseFloat(billFormData.garbage_amount) || 0
    let maintenanceAmount = parseFloat(billFormData.maintenance_amount) || 0
    let otherUtilitiesAmount = parseFloat(billFormData.other_utilities_amount) || 0
    
    // If form values are 0, check active utility types (fallback)
    if (garbageAmount === 0 && maintenanceAmount === 0 && otherUtilitiesAmount === 0) {
      if (activeUtilityTypes && activeUtilityTypes.length > 0) {
        activeUtilityTypes.forEach((utility: any) => {
          const utilityName = utility.name.toLowerCase().trim()
          const utilityRate = utility.rate || 0
          
          if (utilityName.includes('garbage')) {
            garbageAmount = utilityRate
          } else if (utilityName.includes('maintenance')) {
            maintenanceAmount = utilityRate
          } else {
            otherUtilitiesAmount += utilityRate
          }
        })
      }
    }

    const billData = {
      unit_id: selectedUnitForBill,
      tenant_id: selectedUnit.tenants?.id || null,
      billing_month: selectedMonth + '-01',
      water_prev_reading: parseFloat(billFormData.water_prev_reading) || 0,
      water_current_reading: parseFloat(billFormData.water_current_reading) || 0,
      water_rate: parseFloat(billFormData.water_rate) || 50,
      elec_prev_reading: parseFloat(billFormData.elec_prev_reading) || 0,
      elec_current_reading: parseFloat(billFormData.elec_current_reading) || 0,
      elec_rate: parseFloat(billFormData.elec_rate) || 15,
      rent_amount: parseFloat(billFormData.rent_amount) || selectedUnit.monthly_rent || 0,
      arrears_brought_forward: parseFloat(billFormData.arrears_brought_forward) || 0,
      garbage_amount: garbageAmount,
      maintenance_amount: maintenanceAmount,
      other_utilities_amount: otherUtilitiesAmount,
      amount_paid: 0,
      status: 'pending' as const,
    }

    const { data: insertedBill, error: insertError } = await supabase
      .from('bills')
      .insert([billData])
      .select()
      .single()
    
    if (insertError) {
      setError(insertError.message || 'Failed to create bill')
      return
    }

    // Create utility_bill_items for the bill
    if (insertedBill && activeUtilityTypes && activeUtilityTypes.length > 0) {
      const utilityBillItems = activeUtilityTypes.map((utility: any) => ({
        bill_id: insertedBill.id,
        utility_type_id: utility.id,
        units_consumed: 1, // Default to 1 unit for fixed-rate utilities
        rate: utility.rate,
      }))

      const { error: utilityItemsError } = await supabase
        .from('utility_bill_items')
        .insert(utilityBillItems)
      
      if (utilityItemsError) {
        console.error('Failed to create utility bill items:', utilityItemsError)
        // Don't fail the whole operation, just log the error
      }
    }

    // Success - invalidate queries
    await queryClient.invalidateQueries({ queryKey: ['bills'] })
    await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
    await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    await queryClient.refetchQueries({ queryKey: ['bills'] })
    await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] })
    setShowCreateBillModal(false)
    setSelectedUnitForBill('')
    setError(null)
    setBillFormData({
      water_prev_reading: '',
      water_current_reading: '',
      water_rate: '50',
      elec_prev_reading: '',
      elec_current_reading: '',
      elec_rate: '15',
      rent_amount: '',
      arrears_brought_forward: '',
      garbage_amount: '0',
      maintenance_amount: '0',
      other_utilities_amount: '0',
      amount_paid: '0',
    })
  }

  const handleSaveUtilityBill = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedUnitForBill) {
      setError('Please select a unit')
      return
    }

    const selectedUnit = allUnits?.find((u: any) => u.id === selectedUnitForBill)
    if (!selectedUnit) {
      setError('Selected unit not found')
      return
    }

    const garbageAmount = parseFloat(billFormData.garbage_amount) || 0
    const maintenanceAmount = parseFloat(billFormData.maintenance_amount) || 0
    const otherUtilitiesAmount = parseFloat(billFormData.other_utilities_amount) || 0

    if (garbageAmount === 0 && maintenanceAmount === 0 && otherUtilitiesAmount === 0) {
      setError('Please enter at least one utility amount')
      return
    }

    // Get previous month's balance for arrears
    const prevMonth = new Date(selectedMonth + '-01')
    prevMonth.setMonth(prevMonth.getMonth() - 1)
    const prevMonthStr = prevMonth.toISOString().slice(0, 7) + '-01'

    const { data: prevBill } = await supabase
      .from('bills')
      .select('total_amount, amount_paid')
      .eq('unit_id', selectedUnitForBill)
      .eq('billing_month', prevMonthStr)
      .single()

    const prevBalance = prevBill ? (prevBill.total_amount - prevBill.amount_paid) : 0

    const billData = {
      unit_id: selectedUnitForBill,
      tenant_id: selectedUnit.tenants?.id || null,
      billing_month: selectedMonth + '-01',
      water_prev_reading: 0,
      water_current_reading: 0,
      water_rate: 50,
      elec_prev_reading: 0,
      elec_current_reading: 0,
      elec_rate: 15,
      rent_amount: 0,
      arrears_brought_forward: prevBalance > 0 ? prevBalance : 0,
      garbage_amount: garbageAmount,
      maintenance_amount: maintenanceAmount,
      other_utilities_amount: otherUtilitiesAmount,
      amount_paid: 0,
      status: 'pending' as const,
    }

    createUtilityBillMutation.mutate(billData)
  }

  const handlePrintBill = async (bill: any) => {
    try {
      await generateInvoicePDF(bill)
    } catch (error) {
      console.error('Error generating PDF:', error)
      setError('Failed to generate PDF. Please try again.')
    }
  }

  const handlePrintBulkBills = async () => {
    if (!bills || bills.length === 0) {
      setError('No bills to print')
      return
    }
    try {
      await generateBulkInvoicesPDF(bills)
    } catch (error) {
      console.error('Error generating bulk PDF:', error)
      setError('Failed to generate bulk PDF. Please try again.')
    }
  }

  const handleExportBillToExcel = (bill: any) => {
    try {
      exportBillsToExcel([bill], `bill-${bill.id.slice(0, 8)}`)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      setError('Failed to export to Excel. Please try again.')
    }
  }

  const handleExportAllBillsToExcel = () => {
    if (!bills || bills.length === 0) {
      setError('No bills to export')
      return
    }
    try {
      const monthName = formatMonth(selectedMonth).replace(/\s+/g, '-')
      exportBillsToExcel(bills, `bills-${monthName}`)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      setError('Failed to export to Excel. Please try again.')
    }
  }

  const handleImportBills = async () => {
    if (!importFile) {
      setError('Please select a file (PDF or Excel)')
      return
    }

    setError(null)
    setImportProgress(0)
    setImportMessage('Starting import...')
    setImportResult(null)

    try {
      const result = await importBillsFromFile(importFile, selectedMonth, (progress, message) => {
        setImportProgress(progress)
        setImportMessage(message)
      })

      setImportResult(result)
      setImportMessage(`Import completed: ${result.success} successful, ${result.errors.length} errors`)

      // Refresh bills list and related data
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.refetchQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
      await queryClient.refetchQueries({ queryKey: ['arrears-report'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.refetchQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      await queryClient.refetchQueries({ queryKey: ['tenants'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
    } catch (err: any) {
      setError(err.message || 'Failed to import bills')
      setImportMessage('Import failed')
    }
  }

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Monthly Billing
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Manage and generate monthly bills</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 sm:px-4 py-2.5 min-w-[160px]">
            <Calendar className="text-slate-600 dark:text-zinc-100 flex-shrink-0" size={18} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input border-0 p-0 focus:ring-0 bg-transparent text-sm dark:text-zinc-200 dark:placeholder:text-zinc-400 w-full [color-scheme:light] dark:[color-scheme:dark]"
              style={{ color: 'inherit' }}
            />
          </div>
          <button
            onClick={handleCreateBill}
            className="btn btn-secondary"
            title="Create a new bill for a single unit"
          >
            <FileText size={20} />
            New Bill
          </button>
          <button
            onClick={() => {
              setSelectedUnitForBill('')
              setBillFormData({
                water_prev_reading: '0',
                water_current_reading: '0',
                water_rate: '50',
                elec_prev_reading: '0',
                elec_current_reading: '0',
                elec_rate: '15',
                rent_amount: '0',
                arrears_brought_forward: '0',
                garbage_amount: '',
                maintenance_amount: '',
                other_utilities_amount: '',
                amount_paid: '0',
              })
              setError(null)
              setShowCreateUtilityBillModal(true)
            }}
            className="btn btn-secondary"
            title="Create a utility-only bill (garbage, cleaning, maintenance, etc.)"
          >
            <Receipt size={20} />
            Utility Bill
          </button>
          <button
            onClick={handleGenerateBills}
            className="btn btn-primary"
            disabled={occupiedUnitsError !== undefined}
          >
            <Plus size={18} className="sm:size-5" />
            <span className="hidden sm:inline">Generate Bills</span>
            <span className="sm:hidden">Generate</span>
            {occupiedUnits && occupiedUnits.length > 0 && (
              <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                {occupiedUnits.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary"
            title="Import bills from Excel"
          >
            <Upload size={18} className="sm:size-5" />
            <span className="hidden sm:inline">Import File</span>
            <span className="sm:hidden">Import</span>
          </button>
          {bills && bills.length > 0 && (
            <>
              <button
                onClick={handlePrintBulkBills}
                className="btn btn-secondary"
                title="Print all bills as PDF"
              >
                <Printer size={18} className="sm:size-5" />
                <span className="hidden sm:inline">Print All</span>
                <span className="sm:hidden">Print</span>
              </button>
              <button
                onClick={handleExportAllBillsToExcel}
                className="btn btn-secondary"
                title="Export all bills to Excel"
              >
                <FileSpreadsheet size={18} className="sm:size-5" />
                <span className="hidden sm:inline">Export Excel</span>
                <span className="sm:hidden">Excel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {occupiedUnitsError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900 mb-1">Error loading occupied units</p>
          <p className="text-sm text-red-700">{occupiedUnitsError.message || 'Please check your Supabase configuration and ensure you are logged in.'}</p>
        </div>
      )}

      {occupiedUnits && occupiedUnits.length === 0 && !occupiedUnitsError && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
          <p className="text-sm font-semibold text-yellow-900 mb-1">No occupied units found</p>
          <p className="text-sm text-yellow-700">To generate bills, you need to assign tenants to units. Go to the Tenants page and assign a tenant to a unit.</p>
        </div>
      )}

      {billsError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
          <p className="text-sm font-semibold text-red-900 mb-1">Error loading bills</p>
          <p className="text-sm text-red-700">{billsError.message || 'Failed to load bills. Please check your Supabase configuration and ensure you are logged in.'}</p>
        </div>
      )}

      {billsLoading ? (
        <div className="card">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-xl"></div>
            ))}
          </div>
        </div>
      ) : bills && bills.length > 0 ? (
        <div className="space-y-4">
          <div className="card w-full overflow-hidden">
            <div className="w-full overflow-x-auto">
              <table className="table w-full text-[10px] sm:text-xs">
                <thead>
                  <tr>
                    <th className="min-w-[70px]">Unit</th>
                    <th className="min-w-[80px]">Tenant</th>
                    <th className="min-w-[90px]">Water</th>
                    <th className="min-w-[90px]">Electricity</th>
                    <th className="min-w-[60px]">Rent</th>
                    <th className="min-w-[55px]">Utils</th>
                    <th className="min-w-[60px]">Arrears</th>
                    <th className="min-w-[60px]">Total</th>
                    <th className="min-w-[60px]">Paid</th>
                    <th className="min-w-[60px]">Balance</th>
                    <th className="min-w-[60px]">Status</th>
                    <th className="min-w-[75px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill: any) => {
                    const totalUtilities = (bill.garbage_amount || 0) + (bill.maintenance_amount || 0) + (bill.other_utilities_amount || 0)
                    return (
                      <tr key={bill.id}>
                        <td className="font-semibold text-slate-900 dark:text-slate-100 text-[10px] sm:text-xs whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>{bill.units?.unit_number}</span>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-normal truncate max-w-[50px] sm:max-w-none" title={bill.units?.buildings?.name}>
                              {bill.units?.buildings?.name}
                            </span>
                          </div>
                        </td>
                        <td className="text-slate-700 dark:text-slate-300 text-[10px] sm:text-xs">
                          <span className="truncate block max-w-[60px] sm:max-w-none" title={bill.tenants?.name || 'N/A'}>
                            {bill.tenants?.name || 'N/A'}
                          </span>
                        </td>
                        <td className="text-slate-600 dark:text-slate-400 text-[9px] sm:text-[10px]">
                          <div className="flex flex-col">
                            {bill.water_amount > 0 || bill.water_prev_reading || bill.water_current_reading ? (
                              <>
                                <span className="font-medium">{formatCurrency(bill.water_amount || 0)}</span>
                                <span className="text-slate-500 dark:text-slate-500 text-[8px]">
                                  {bill.water_prev_reading || 0}→{bill.water_current_reading || 0}
                                </span>
                                <span className="text-slate-500 dark:text-slate-500 text-[8px]">
                                  {bill.water_units_consumed || 0}u@{formatCurrency(bill.water_rate || 0)}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="text-slate-600 dark:text-slate-400 text-[9px] sm:text-[10px]">
                          <div className="flex flex-col">
                            {bill.elec_amount > 0 || bill.elec_prev_reading || bill.elec_current_reading ? (
                              <>
                                <span className="font-medium">{formatCurrency(bill.elec_amount || 0)}</span>
                                <span className="text-slate-500 dark:text-slate-500 text-[8px]">
                                  {bill.elec_prev_reading || 0}→{bill.elec_current_reading || 0}
                                </span>
                                <span className="text-slate-500 dark:text-slate-500 text-[8px]">
                                  {bill.elec_units_consumed || 0}u@{formatCurrency(bill.elec_rate || 0)}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </div>
                        </td>
                        <td className="text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs whitespace-nowrap">
                          {formatCurrency(bill.rent_amount || 0)}
                        </td>
                        <td className="text-slate-600 dark:text-slate-400 text-[10px] sm:text-xs">
                          {totalUtilities > 0 ? (
                            <div className="flex flex-col">
                              <span className="font-medium">{formatCurrency(totalUtilities)}</span>
                              {(bill.garbage_amount > 0 || bill.maintenance_amount > 0 || bill.other_utilities_amount > 0) && (
                                <span className="text-slate-500 dark:text-slate-500 text-[8px]">
                                  {bill.garbage_amount > 0 && 'G '}
                                  {bill.maintenance_amount > 0 && 'M '}
                                  {bill.other_utilities_amount > 0 && 'O'}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="font-medium text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs whitespace-nowrap">
                          {formatCurrency(bill.arrears_brought_forward || 0)}
                        </td>
                        <td className="font-bold text-slate-900 dark:text-slate-100 text-[10px] sm:text-xs whitespace-nowrap">
                          {formatCurrency(bill.total_amount || 0)}
                        </td>
                        <td className="font-semibold text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs whitespace-nowrap">
                          {formatCurrency(bill.amount_paid || 0)}
                        </td>
                        <td
                          className={`font-bold text-[10px] sm:text-xs whitespace-nowrap ${
                            bill.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {formatCurrency(bill.balance || 0)}
                        </td>
                        <td>
                          <span
                            className={`badge text-[9px] px-1 py-0.5 ${
                              bill.status === 'paid'
                                ? 'badge-success'
                                : bill.status === 'partial'
                                ? 'badge-warning'
                                : 'badge-danger'
                            }`}
                          >
                            {bill.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => handlePrintBill(bill)}
                              className="p-1 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                              title="Print Bill (PDF)"
                            >
                              <Printer size={12} />
                            </button>
                            <button
                              onClick={() => handleExportBillToExcel(bill)}
                              className="p-1 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-all"
                              title="Export to Excel"
                            >
                              <FileSpreadsheet size={12} />
                            </button>
                            <button
                              onClick={() => handleEditBill(bill)}
                              className="p-1 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                              title="Edit Bill"
                            >
                              <Edit size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Receipt className="text-slate-400" size={40} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No bills found for {formatMonth(selectedMonth)}
          </h3>
          <p className="text-slate-600 mb-6">Generate bills to get started</p>
          <button onClick={handleGenerateBills} className="btn btn-primary">
            <Plus size={20} />
            Generate Bills for This Month
          </button>
        </div>
      )}

      {showMeterModal && (
        <div className="modal-overlay" onClick={() => {
          setShowMeterModal(false)
          setMeterReadings({})
        }}>
          <div className="modal-content max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Enter Meter Readings</h2>
              <p className="text-slate-600 mb-6">
                Enter current meter readings for all units. Previous readings will be auto-filled where available.
              </p>
            
              <div className="space-y-4 mb-6 max-h-[60vh] overflow-y-auto pr-2">
                {occupiedUnits?.map((unit: any) => {
                  const readings = meterReadings[unit.id] || {
                    water_prev: 0,
                    water_current: 0,
                    elec_prev: 0,
                    elec_current: 0,
                  }
                  
                  return (
                    <div key={unit.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                      <h3 className="font-semibold text-slate-900 mb-3">
                        {unit.unit_number} - {unit.buildings?.name}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Water Previous</label>
                          <input
                            type="number"
                            value={readings.water_prev}
                            onChange={(e) =>
                              setMeterReadings({
                                ...meterReadings,
                                [unit.id]: {
                                  ...readings,
                                  water_prev: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="input text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Water Current</label>
                          <input
                            type="number"
                            value={readings.water_current}
                            onChange={(e) =>
                              setMeterReadings({
                                ...meterReadings,
                                [unit.id]: {
                                  ...readings,
                                  water_current: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="input text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Electricity Previous</label>
                          <input
                            type="number"
                            value={readings.elec_prev}
                            onChange={(e) =>
                              setMeterReadings({
                                ...meterReadings,
                                [unit.id]: {
                                  ...readings,
                                  elec_prev: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="input text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Electricity Current</label>
                          <input
                            type="number"
                            value={readings.elec_current}
                            onChange={(e) =>
                              setMeterReadings({
                                ...meterReadings,
                                [unit.id]: {
                                  ...readings,
                                  elec_current: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="input text-sm"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowMeterModal(false)
                    setMeterReadings({})
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 btn btn-primary"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Generate Bills
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Bill Modal */}
      {showEditBillModal && editingBill && (
        <div className="modal-overlay" onClick={() => {
          setShowEditBillModal(false)
          setEditingBill(null)
          setError(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Edit Bill</h2>
              <p className="text-slate-600 mb-6">
                {editingBill.units?.unit_number} - {editingBill.units?.buildings?.name}
              </p>
              
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 mb-1">Error</p>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveEditBill} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Previous Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, water_prev_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Current Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_current_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, water_current_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, water_rate: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Previous Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_prev_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Current Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_current_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_current_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_rate: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Rent Amount (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.rent_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, rent_amount: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Arrears Brought Forward (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.arrears_brought_forward}
                      onChange={(e) => setBillFormData({ ...billFormData, arrears_brought_forward: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Garbage Collection (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.garbage_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, garbage_amount: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Maintenance (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.maintenance_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, maintenance_amount: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Other Utilities (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.other_utilities_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, other_utilities_amount: e.target.value })}
                      className="input"
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      For additional utilities like parking, security, etc.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Amount Paid (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.amount_paid}
                      onChange={(e) => setBillFormData({ ...billFormData, amount_paid: e.target.value })}
                      className="input"
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Adjusting this will update the balance automatically. Remaining balance becomes arrears for next month.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditBillModal(false)
                      setEditingBill(null)
                      setError(null)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={updateBillMutation.isPending}
                  >
                    {updateBillMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={20} />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Utility-Only Bill Modal */}
      {showCreateUtilityBillModal && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateUtilityBillModal(false)
          setSelectedUnitForBill('')
          setError(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Create Utility Bill</h2>
              <p className="text-slate-600 mb-6">
                Create a utility-only bill (garbage, cleaning, maintenance, etc.) for {formatMonth(selectedMonth)}
              </p>
              
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 mb-1">Error</p>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveUtilityBill} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select Unit <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedUnitForBill}
                    onChange={(e) => {
                      setSelectedUnitForBill(e.target.value)
                      const unit = allUnits?.find((u: any) => u.id === e.target.value)
                      if (unit) {
                        // Get previous month's balance
                        const prevMonth = new Date(selectedMonth + '-01')
                        prevMonth.setMonth(prevMonth.getMonth() - 1)
                        const prevMonthStr = prevMonth.toISOString().slice(0, 7) + '-01'
                        
                        supabase
                          .from('bills')
                          .select('total_amount, amount_paid')
                          .eq('unit_id', e.target.value)
                          .eq('billing_month', prevMonthStr)
                          .single()
                          .then(({ data: prevBill }) => {
                            const prevBalance = prevBill ? (prevBill.total_amount - prevBill.amount_paid) : 0
                            setBillFormData(prev => ({
                              ...prev,
                              arrears_brought_forward: prevBalance > 0 ? prevBalance.toString() : '0'
                            }))
                          })
                      }
                    }}
                    required
                    className="input"
                  >
                    <option value="">Select a unit</option>
                    {allUnits?.map((unit: any) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_number} - {unit.buildings?.name || 'N/A'} {unit.tenants?.name ? `(${unit.tenants.name})` : '(Vacant)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Garbage Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billFormData.garbage_amount}
                      onChange={(e) => setBillFormData(prev => ({ ...prev, garbage_amount: e.target.value }))}
                      placeholder="0.00"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Maintenance Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billFormData.maintenance_amount}
                      onChange={(e) => setBillFormData(prev => ({ ...prev, maintenance_amount: e.target.value }))}
                      placeholder="0.00"
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Other Utilities Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billFormData.other_utilities_amount}
                      onChange={(e) => setBillFormData(prev => ({ ...prev, other_utilities_amount: e.target.value }))}
                      placeholder="0.00"
                      className="input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Arrears Brought Forward
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={billFormData.arrears_brought_forward}
                    onChange={(e) => setBillFormData(prev => ({ ...prev, arrears_brought_forward: e.target.value }))}
                    placeholder="0.00"
                    className="input"
                    readOnly
                  />
                  <p className="text-xs text-slate-500 mt-1">Automatically calculated from previous month's balance</p>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateUtilityBillModal(false)
                      setSelectedUnitForBill('')
                      setError(null)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={createUtilityBillMutation.isPending}
                  >
                    {createUtilityBillMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <Receipt size={18} className="mr-2" />
                        Create Utility Bill
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Single Bill Modal */}
      {showCreateBillModal && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateBillModal(false)
          setSelectedUnitForBill('')
          setError(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Create New Utility Bill</h2>
              <p className="text-slate-600 mb-6">
                Create a bill for a single unit for {formatMonth(selectedMonth)}
              </p>
              
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 mb-1">Error</p>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveCreateBill} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select Unit
                  </label>
                  <select
                    value={selectedUnitForBill}
                    onChange={async (e) => {
                      setSelectedUnitForBill(e.target.value)
                      const unit = allUnits?.find((u: any) => u.id === e.target.value)
                      if (unit) {
                        // Auto-fill rent amount
                        const newFormData: any = {
                          ...billFormData,
                          rent_amount: unit.monthly_rent?.toString() || ''
                        }

                        // Auto-calculate arrears from previous month
                        const prevMonth = new Date(selectedMonth + '-01')
                        prevMonth.setMonth(prevMonth.getMonth() - 1)
                        const prevMonthStr = prevMonth.toISOString().slice(0, 7) + '-01'

                        const { data: prevBill } = await supabase
                          .from('bills')
                          .select('balance')
                          .eq('unit_id', unit.id)
                          .eq('billing_month', prevMonthStr)
                          .single()

                        if (prevBill && prevBill.balance > 0) {
                          newFormData.arrears_brought_forward = prevBill.balance.toString()
                        } else {
                          newFormData.arrears_brought_forward = '0'
                        }

                        // Auto-fill utility amounts from active utility types ONLY
                        // Reset utility amounts first
                        newFormData.garbage_amount = '0'
                        newFormData.maintenance_amount = '0'
                        newFormData.other_utilities_amount = '0'
                        
                        if (activeUtilityTypes && activeUtilityTypes.length > 0) {
                          console.log('Create Bill Form - Active utility types found:', activeUtilityTypes)
                          
                          // Map each active utility type to the correct field
                          activeUtilityTypes.forEach((utility: any) => {
                            const utilityName = utility.name.toLowerCase().trim()
                            // Use the exact rate from the utility type (rate IS the amount for fixed-rate utilities)
                            const utilityRate = parseFloat(utility.rate) || 0
                            
                            console.log(`Processing utility: "${utility.name}" (is_active: ${utility.is_active}), Rate: ${utilityRate}`)
                            
                            // Match utility names more flexibly
                            if (utilityName.includes('garbage')) {
                              newFormData.garbage_amount = utilityRate.toString()
                              console.log(`  → Mapped to garbage_amount: ${utilityRate}`)
                            } else if (utilityName.includes('maintenance')) {
                              newFormData.maintenance_amount = utilityRate.toString()
                              console.log(`  → Mapped to maintenance_amount: ${utilityRate}`)
                            } else {
                              // All other utilities go to other_utilities_amount
                              const currentOther = parseFloat(newFormData.other_utilities_amount || '0')
                              newFormData.other_utilities_amount = (currentOther + utilityRate).toString()
                              console.log(`  → Mapped to other_utilities_amount: ${utilityRate} (total: ${newFormData.other_utilities_amount})`)
                            }
                          })
                          
                          console.log('Create Bill Form - Final utility amounts:', {
                            garbage: newFormData.garbage_amount,
                            maintenance: newFormData.maintenance_amount,
                            other: newFormData.other_utilities_amount
                          })
                        } else {
                          console.log('Create Bill Form - No active utility types found')
                        }

                        setBillFormData(newFormData)
                      }
                    }}
                    className="input"
                    required
                  >
                    <option value="">Select a unit</option>
                    {allUnits?.map((unit: any) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_number} - {unit.buildings?.name} {unit.tenants ? `(${unit.tenants.name})` : '(Vacant)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Previous Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, water_prev_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Current Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_current_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, water_current_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, water_rate: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Previous Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_prev_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Current Reading
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_current_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_current_reading: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_rate: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Rent Amount (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.rent_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, rent_amount: e.target.value })}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Arrears Brought Forward (KES) <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">(Auto-calculated)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.arrears_brought_forward}
                      onChange={(e) => setBillFormData({ ...billFormData, arrears_brought_forward: e.target.value })}
                      className="input bg-slate-50 dark:bg-zinc-900"
                      placeholder="0.00"
                      readOnly
                      title="Automatically calculated from previous month's balance when you select a unit"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Garbage (KES) <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.garbage_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, garbage_amount: e.target.value })}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Maintenance (KES) <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.maintenance_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, maintenance_amount: e.target.value })}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Other Utilities (KES) <span className="text-xs text-slate-500 dark:text-zinc-400 font-normal">(Auto-filled)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.other_utilities_amount}
                      onChange={(e) => setBillFormData({ ...billFormData, other_utilities_amount: e.target.value })}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateBillModal(false)
                      setSelectedUnitForBill('')
                      setError(null)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={createBillMutation.isPending}
                  >
                    {createBillMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={20} />
                        Create Bill
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={() => {
          setShowImportModal(false)
          setImportFile(null)
          setImportProgress(0)
          setImportMessage('')
          setImportResult(null)
          setError(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">Import Bills from Excel</h2>
              
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">Importing for: {formatMonth(selectedMonth)}</p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  The selected month above will be used for all imported bills. Make sure your Excel file matches the billing statement format.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">Error</p>
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              {importResult && (
                <div className={`mb-4 p-4 border rounded-xl ${importResult.errors.length > 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'}`}>
                  <p className={`text-sm font-semibold mb-2 ${importResult.errors.length > 0 ? 'text-yellow-900 dark:text-yellow-200' : 'text-green-900 dark:text-green-200'}`}>
                    Import Results: {importResult.success} successful, {importResult.errors.length} errors
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="max-h-40 overflow-y-auto">
                      <ul className={`text-xs list-disc list-inside space-y-1 ${importResult.errors.length > 0 ? 'text-yellow-800 dark:text-yellow-300' : ''}`}>
                        {importResult.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Select File (PDF or Excel)
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.pdf"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="input"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    <strong>Supported formats:</strong> PDF or Excel (.xlsx, .xls)<br />
                    <strong>Expected data:</strong> Unit, Names (with phone numbers), Water readings (Sept/Oct), 
                    Electricity readings (Sept/Oct), Rent, Garbage fee, Total, Paid, Due.<br />
                    <strong>Note:</strong> The system will automatically create/update tenants from the Names column.
                  </p>
                </div>

                {importProgress > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600 dark:text-slate-400">{importMessage}</span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{Math.round(importProgress)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImportModal(false)
                      setImportFile(null)
                      setImportProgress(0)
                      setImportMessage('')
                      setImportResult(null)
                      setError(null)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleImportBills}
                    disabled={!importFile || importProgress > 0}
                    className="flex-1 btn btn-primary"
                  >
                    <FileSpreadsheet size={18} />
                    Import Bills
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

