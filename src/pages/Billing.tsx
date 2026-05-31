import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatMonth } from '@/lib/utils'
import { generateInvoicePDF, generateBulkInvoicesPDF } from '@/lib/pdf'
import { exportBillsToExcel } from '@/lib/excel'
import { importBillsFromFile } from '@/lib/excel-import'
import { fetchBuildingPaymentByUnitId } from '@/lib/payment-instructions'
import ExportColumnsModal from '@/components/ExportColumnsModal'
import useToast from '@/hooks/useToast'
import { Plus, Calendar, CheckCircle, Receipt, Edit, FileText, AlertCircle, X, Printer, FileSpreadsheet, Upload } from 'lucide-react'

export default function Billing() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [showMeterModal, setShowMeterModal] = useState(false)
  const [showEditBillModal, setShowEditBillModal] = useState(false)
  const [showCreateBillModal, setShowCreateBillModal] = useState(false)
  const [showCreateUtilityBillModal, setShowCreateUtilityBillModal] = useState(false)
  const [editingBill, setEditingBill] = useState<any>(null)
  const [editingBillTenantId, setEditingBillTenantId] = useState<string>('')
  const [selectedUnitForBill, setSelectedUnitForBill] = useState<string>('')
  const [meterReadings, setMeterReadings] = useState<Record<string, {
    water_prev: number
    water_current: number
    elec_prev: number
    elec_current: number
  }>>({})
  const [bulkRates, setBulkRates] = useState({
    water_rate: '',
    elec_rate: ''
  })
  const [billFormData, setBillFormData] = useState({
    water_prev_reading: '',
    water_current_reading: '',
    water_rate: '',
    elec_prev_reading: '',
    elec_current_reading: '',
    elec_rate: '',
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
  const [search, setSearch] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentFormData, setPaymentFormData] = useState({
    payment_method: '',
    paybill: '',
    account_number: '',
  })

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [importMessage, setImportMessage] = useState('')
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportBillsToUse, setExportBillsToUse] = useState<any[]>([])
  const queryClient = useQueryClient()
  const toast = useToast()

  // Map database/Supabase errors to clear, user-friendly messages
  const friendlyErrorMessage = (err: any, defaultMsg?: string) => {
    if (!err) return defaultMsg || 'An unexpected error occurred. Please try again.'
    const text = (err.message || err.error_description || err.details || '').toString()
    const code = (err.code || err.status || '')

    // Unique constraint / duplicate entry
    if (/23505|duplicate|unique|violates unique|already exists/i.test(text) || /23505/.test(String(code))) {
      return 'A bill for that unit and month already exists. To modify it, open the existing bill from the list.'
    }

    // Permission / RLS issues
    if (/permission denied|forbidden|not authorized|authentication/i.test(text)) {
      return 'Permission denied. Please check your login and account permissions.'
    }

    // Fallback to the server-provided message when safe, else a generic message
    return text || defaultMsg || 'An unexpected error occurred. Please try again.'
  }

  useEffect(() => {
    const stored = localStorage.getItem('app-settings')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setPaymentFormData({
          payment_method: parsed.payment_method || '',
          paybill: parsed.paybill || '',
          account_number: parsed.account_number || '',
        })
      } catch (e) {
        // ignore
      }
    }
  }, [])

  const savePaymentSettings = () => {
    try {
      const stored = localStorage.getItem('app-settings')
      const parsed = stored ? JSON.parse(stored) : {}
      const merged = { ...parsed, ...paymentFormData }
      localStorage.setItem('app-settings', JSON.stringify(merged))
      setShowPaymentModal(false)
    } catch (e) {
      console.error('Failed to save payment settings', e)
      toast.error('Failed to save payment settings')
    }
  }


  // Helper: sync the bill status using fresh DB-calculated values
  const syncBillStatus = async (billId: string) => {
    try {
      const { data: freshBill, error: freshError } = await supabase
        .from('bills')
        .select('total_amount, amount_paid, balance, status')
        .eq('id', billId)
        .single()

      if (freshError) {
        console.warn('Failed to fetch fresh bill for status sync:', freshError)
        return
      }

      const total = freshBill.total_amount || 0
      const paid = freshBill.amount_paid || 0
      const balance = typeof freshBill.balance === 'number' ? freshBill.balance : (total - paid)
      const EPS = 0.0001
      const computedStatus = balance <= EPS ? 'paid' : paid > 0 ? 'partial' : 'pending'

      if (computedStatus !== freshBill.status) {
        const { error: statusErr } = await supabase
          .from('bills')
          .update({ status: computedStatus })
          .eq('id', billId)

        if (statusErr) console.warn('Failed to sync bill status:', statusErr)
      }
    } catch (err) {
      console.warn('syncBillStatus error', err)
    }
  }

  // Get settings for default rates
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const stored = localStorage.getItem('app-settings')
      if (stored) {
        return JSON.parse(stored)
      }
      return { water_rate: 50, elec_rate: 15 }
    },
  })

  const { data: tenantsForEditingUnit } = useQuery({
    queryKey: ['bill-edit-tenants', editingBill?.id, editingBill?.unit_id, editingBill?.tenant_id],
    queryFn: async () => {
      if (!editingBill?.unit_id) return []

      const { data: unitTenants, error: unitTenantsError } = await supabase
        .from('tenants')
        .select('id, name, status')
        .eq('unit_id', editingBill.unit_id)
        .order('name', { ascending: true })

      if (unitTenantsError) throw unitTenantsError

      const tenantMap = new Map<string, any>()
      ;(unitTenants || []).forEach((tenant: any) => tenantMap.set(tenant.id, tenant))

      // Include current bill tenant even if no longer assigned to this unit,
      // so historical bills can still be corrected from the edit form.
      if (editingBill?.tenant_id && !tenantMap.has(editingBill.tenant_id)) {
        const { data: billTenant } = await supabase
          .from('tenants')
          .select('id, name, status')
          .eq('id', editingBill.tenant_id)
          .maybeSingle()
        if (billTenant) tenantMap.set(billTenant.id, billTenant)
      }

      return Array.from(tenantMap.values())
    },
    enabled: showEditBillModal && !!editingBill?.unit_id,
  })

  const { data: bills, error: billsError, isLoading: billsLoading } = useQuery({
    queryKey: ['bills', selectedMonth],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      const monthStart = selectedMonth + '-01'
      const monthParts = selectedMonth.split('-').map(Number)
      let ny = monthParts[0]
      let nm = monthParts[1] + 1
      if (nm > 12) {
        nm = 1
        ny += 1
      }
      const monthEnd = `${ny}-${String(nm).padStart(2, '0')}-01`

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
            building_name: buildingName || '',
            units: unitRes.data ? {
              unit_number: unitRes.data.unit_number,
              buildings: buildingName ? { name: buildingName } : null
            } : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null
          }
        })
      )
      
      // Sort by unit number descending to show highest units first
      billsWithRelations.sort((a: any, b: any) => (b.units?.unit_number || '').toString().localeCompare((a.units?.unit_number || '').toString()))
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

  const filteredBills = (bills || []).filter((b: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (b.units?.unit_number || '').toString().toLowerCase().includes(q) ||
      (b.tenants?.name || '').toLowerCase().includes(q) ||
      (b.units?.buildings?.name || '').toLowerCase().includes(q)
    )
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

  const fetchAdvanceCreditsForMonth = async (monthStr: string) => {
    const { data, error } = await supabase
      .from('advance_payments')
      .select('id, unit_id, amount')
      .eq('target_month', monthStr)
      .is('applied_bill_id', null)

    if (error) {
      console.error('Failed to fetch advance payments for month', monthStr, error)
      throw error
    }

    const credits = new Map<string, { total: number; ids: string[] }>()
    for (const row of data || []) {
      const id = row.id
      const unitId = row.unit_id
      const amount = Number(row.amount || 0)
      const existing = credits.get(unitId) || { total: 0, ids: [] }
      existing.total += amount
      existing.ids.push(id)
      credits.set(unitId, existing)
    }

    return credits
  }

  const fetchAdvanceCreditForMonthAndUnit = async (monthStr: string, unitId: string) => {
    const { data, error } = await supabase
      .from('advance_payments')
      .select('amount')
      .eq('target_month', monthStr)
      .eq('unit_id', unitId)
      .is('applied_bill_id', null)

    if (error) {
      console.error('Failed to fetch advance credits for unit', unitId, monthStr, error)
      throw error
    }

    return (data || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
  }

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
      const parts = selectedMonth.split('-').map(Number)
      let py = parts[0]
      let pm = parts[1] - 1
      if (pm < 1) {
        pm = 12
        py -= 1
      }
      const prevMonthStr = `${py}-${String(pm).padStart(2, '0')}-01`

      console.log('Calculating arrears from previous month:', prevMonthStr)

      const { data: prevBills } = await supabase
        .from('bills')
        .select('unit_id, balance, total_amount, amount_paid')
        .eq('billing_month', prevMonthStr)

      // Use balance (which is automatically calculated by database: total_amount - amount_paid) as arrears
      // This ensures that if 9000 was paid on a 10000 bill, the remaining 1000 automatically becomes arrears
      // Carry forward previous balance as arrears_brought_forward.
      // Allow negative balances (overpayments) to be carried forward as negative arrears.
      const prevBalances = new Map(
        prevBills?.map((b) => {
          const arrears = (b.balance || 0)
          console.log(`Unit ${b.unit_id}: Previous balance ${b.balance} will be carried forward as arrears_brought_forward`)
          return [b.unit_id, arrears]
        }) || []
      )

      const monthStr = selectedMonth + '-01'
      const advanceCredits = await fetchAdvanceCreditsForMonth(monthStr)
      if (advanceCredits.size > 0) {
        console.log('Advance credits found for target month:', advanceCredits)
      }

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

      // Get rates from bulk rates state or settings, fallback to defaults
      // Fetch settings directly within the mutation to ensure we have the latest values
      const storedSettings = localStorage.getItem('app-settings')
      const parsedSettings = storedSettings ? JSON.parse(storedSettings) : null
      
      // Use rates from bulkRates if provided, otherwise use settings, otherwise use defaults
      const defaultWaterRate = bulkRates.water_rate ? parseFloat(bulkRates.water_rate) : (parsedSettings?.water_rate || 50)
      const defaultElecRate = bulkRates.elec_rate ? parseFloat(bulkRates.elec_rate) : (parsedSettings?.elec_rate || 15)
      
      console.log('Bill generation rates:', {
        bulkRates,
        parsedSettings,
        defaultWaterRate,
        defaultElecRate
      })

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

      const unitIds = occupiedUnits.map((u: any) => u.id)

      const { data: existingMonthBills, error: existingErr } = await supabase
        .from('bills')
        .select('id, unit_id, amount_paid')
        .eq('billing_month', monthStr)
        .in('unit_id', unitIds)

      if (existingErr) throw existingErr
      const existingByUnit = new Map((existingMonthBills || []).map((row) => [row.unit_id, row]))

      const toInsert: any[] = []
      const toUpdate: { id: string; unitId: string; patch: Record<string, unknown> }[] = []
      const billIdByUnitId = new Map<string, string>()

      for (const unit of occupiedUnits) {
        const readings = meterReadings[unit.id] || {
          water_prev: prevMeterReadings.get(unit.id)?.water || 0,
          water_current: prevMeterReadings.get(unit.id)?.water || 0,
          elec_prev: prevMeterReadings.get(unit.id)?.elec || 0,
          elec_current: prevMeterReadings.get(unit.id)?.elec || 0,
        }

        const arrears = prevBalances.get(unit.id) || 0
        const advanceCredit = advanceCredits.get(unit.id)?.total || 0

        if (advanceCredit !== 0) {
          console.log(`Unit ${unit.id}: Applying advance credit of ${advanceCredit} to ${monthStr}`)
        }

        const patch = {
          tenant_id: unit.tenants?.id || null,
          billing_month: monthStr,
          water_prev_reading: readings.water_prev,
          water_current_reading: readings.water_current,
          water_rate: defaultWaterRate,
          elec_prev_reading: readings.elec_prev,
          elec_current_reading: readings.elec_current,
          elec_rate: defaultElecRate,
          rent_amount: unit.monthly_rent || 0,
          arrears_brought_forward: arrears - advanceCredit,
          garbage_amount: garbageAmount,
          maintenance_amount: maintenanceAmount,
          other_utilities_amount: otherUtilitiesAmount,
        }

        const ex = existingByUnit.get(unit.id)
        if (ex) {
          toUpdate.push({ id: ex.id, unitId: unit.id, patch })
        } else {
          toInsert.push({
            ...patch,
            unit_id: unit.id,
            amount_paid: 0,
            status: 'pending' as const,
          })
        }
      }

      const processedBillIds: string[] = []

      for (const u of toUpdate) {
        const { error: upErr } = await supabase.from('bills').update(u.patch).eq('id', u.id)
        if (upErr) throw upErr
        processedBillIds.push(u.id)
        billIdByUnitId.set(u.unitId, u.id)
      }

      let insertedBills: any[] = []
      if (toInsert.length > 0) {
        const { data: ins, error: billsError } = await supabase.from('bills').insert(toInsert).select()
        if (billsError) throw billsError
        insertedBills = ins || []
        insertedBills.forEach((b: any) => {
          processedBillIds.push(b.id)
          billIdByUnitId.set(b.unit_id, b.id)
        })
      }

      if (advanceCredits.size > 0) {
        for (const [unitId, advanceCredit] of advanceCredits.entries()) {
          const billId = billIdByUnitId.get(unitId)
          if (!billId || advanceCredit.ids.length === 0) continue

          const { error: applyErr } = await supabase
            .from('advance_payments')
            .update({ applied_bill_id: billId, applied_at: new Date().toISOString() })
            .in('id', advanceCredit.ids)

          if (applyErr) {
            console.warn('Failed to mark advance payments applied for unit', unitId, applyErr)
          }
        }
      }

      if (processedBillIds.length > 0) {
        await supabase.from('utility_bill_items').delete().in('bill_id', processedBillIds)
      }

      if (processedBillIds.length > 0 && activeUtilityTypes && activeUtilityTypes.length > 0) {
        const utilityBillItems: any[] = []
        for (const billId of processedBillIds) {
          for (const utility of activeUtilityTypes) {
            utilityBillItems.push({
              bill_id: billId,
              utility_type_id: utility.id,
              units_consumed: 1,
              rate: utility.rate,
            })
          }
        }
        if (utilityBillItems.length > 0) {
          const { error: utilityItemsError } = await supabase.from('utility_bill_items').insert(utilityBillItems)
          if (utilityItemsError) {
            console.error('Failed to create utility bill items:', utilityItemsError)
          }
        }
      }

      if (processedBillIds.length > 0) {
        for (const billId of processedBillIds) {
          try {
            await syncBillStatus(billId)
          } catch (err) {
            console.warn('Failed to sync generated bill status for', billId, err)
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
      const msg = friendlyErrorMessage(error, 'Failed to generate bills. Please try again.')
      toast.error(msg)
    },
  })

  const handleGenerateBills = () => {
    if (occupiedUnitsError) {
      toast.error(`Error loading occupied units: ${occupiedUnitsError.message || 'Please check your Supabase configuration and ensure you are logged in.'}`)
      return
    }
    
    if (!occupiedUnits || occupiedUnits.length === 0) {
      toast.info('No occupied units found. Please assign tenants to units first.')
      return
    }

    // Pre-fill meter readings from latest bills for each occupied unit so users see previous readings
    ;(async () => {
      try {
        const readingsMap: Record<string, any> = {}
        await Promise.all(
          occupiedUnits.map(async (unit: any) => {
            const latest = await fetchLatestMeterReadings(unit.id)
            readingsMap[unit.id] = {
              water_prev: latest.water || 0,
              water_current: latest.water || 0,
              elec_prev: latest.elec || 0,
              elec_current: latest.elec || 0,
            }
          })
        )

        setMeterReadings(readingsMap)

        // Pre-fill bulkRates from settings if available
        const storedSettings = localStorage.getItem('app-settings')
        const parsedSettings = storedSettings ? JSON.parse(storedSettings) : null
        setBulkRates({
          water_rate: parsedSettings?.water_rate?.toString() || '',
          elec_rate: parsedSettings?.elec_rate?.toString() || '',
        })

        setShowMeterModal(true)
      } catch (err) {
        console.error('Failed to prefill meter readings:', err)
        // fallback: still open modal but with empty readings
        setMeterReadings({})
        setShowMeterModal(true)
      }
    })()
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
      await syncBillStatus(id)
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
        water_rate: '',
        elec_prev_reading: '',
        elec_current_reading: '',
        elec_rate: '',
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
      setError(friendlyErrorMessage(error, 'Failed to update bill.'))
    },
  })

  // Create single bill mutation
  const createBillMutation = useMutation({
    mutationFn: async (billData: any) => {
      const { data, error } = await supabase
        .from('bills')
        .insert([billData])
        .select()
        .single()
      
      if (error) throw error
      if (data?.id) await syncBillStatus(data.id)
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
        water_rate: '',
        elec_prev_reading: '',
        elec_current_reading: '',
        elec_rate: '',
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
      setError(friendlyErrorMessage(error, 'Failed to create bill.'))
    },
  })

  // Create utility-only bill mutation
  const createUtilityBillMutation = useMutation({
    mutationFn: async (billData: any) => {
      const { data, error } = await supabase
        .from('bills')
        .insert([billData])
        .select()
        .single()
      
      if (error) throw error
      if (data?.id) await syncBillStatus(data.id)
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
        water_rate: '',
        elec_prev_reading: '',
        elec_current_reading: '',
        elec_rate: '',
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
      setError(friendlyErrorMessage(error, 'Failed to create utility bill.'))
    },
  })

  // Function to fetch latest meter readings for a unit
  const fetchLatestMeterReadings = async (unitId: string) => {
    try {
      // Get the most recent bill for this unit (excluding the current month if editing)
      const { data: latestBill, error } = await supabase
        .from('bills')
        .select('water_current_reading, elec_current_reading, billing_month')
        .eq('unit_id', unitId)
        .order('billing_month', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching latest meter readings:', error)
        return { water: 0, elec: 0 }
      }

      if (latestBill) {
        return {
          water: latestBill.water_current_reading || 0,
          elec: latestBill.elec_current_reading || 0,
        }
      }

      return { water: 0, elec: 0 }
    } catch (err) {
      console.error('Error fetching latest meter readings:', err)
      return { water: 0, elec: 0 }
    }
  }

  const handleEditBill = (bill: any) => {
    setEditingBill(bill)
    setEditingBillTenantId(bill.tenant_id || '')
    setBillFormData({
      water_prev_reading: bill.water_prev_reading?.toString() || '',
      water_current_reading: bill.water_current_reading?.toString() || '',
      water_rate: bill.water_rate?.toString() || '',
      elec_prev_reading: bill.elec_prev_reading?.toString() || '',
      elec_current_reading: bill.elec_current_reading?.toString() || '',
      elec_rate: bill.elec_rate?.toString() || '',
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
    
    // Get settings to initialize rate fields
    const storedSettings = localStorage.getItem('app-settings')
    const parsedSettings = storedSettings ? JSON.parse(storedSettings) : null
    
    setBillFormData({
      water_prev_reading: '',
      water_current_reading: '',
      water_rate: parsedSettings?.water_rate?.toString() || '',
      elec_prev_reading: '',
      elec_current_reading: '',
      elec_rate: parsedSettings?.elec_rate?.toString() || '',
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
    // Fetch settings directly to ensure we have the latest values
    const storedSettings = localStorage.getItem('app-settings')
    const parsedSettings = storedSettings ? JSON.parse(storedSettings) : null
    const waterRate = parseFloat(billFormData.water_rate) || parsedSettings?.water_rate || 50
    const elecRate = parseFloat(billFormData.elec_rate) || parsedSettings?.elec_rate || 15
      const waterAmount = Math.round(waterUnits * waterRate * 100) / 100
      const elecAmount = Math.round(elecUnits * elecRate * 100) / 100
      const rentAmount = Math.round(parseFloat(billFormData.rent_amount) * 100 || 0) / 100
      const arrears = Math.round(parseFloat(billFormData.arrears_brought_forward) * 100 || 0) / 100
      const garbageAmount = Math.round(parseFloat(billFormData.garbage_amount) * 100 || 0) / 100
      const maintenanceAmount = Math.round(parseFloat(billFormData.maintenance_amount) * 100 || 0) / 100
      const otherUtilitiesAmount = Math.round(parseFloat(billFormData.other_utilities_amount) * 100 || 0) / 100
      const totalAmount = waterAmount + elecAmount + rentAmount + arrears + garbageAmount + maintenanceAmount + otherUtilitiesAmount
    const newBalance = totalAmount - amountPaid
    const newStatus = newBalance <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'pending'

    const updates = {
      tenant_id: editingBillTenantId || null,
      water_prev_reading: parseFloat(billFormData.water_prev_reading) || 0,
      water_current_reading: parseFloat(billFormData.water_current_reading) || 0,
      water_rate: parseFloat(billFormData.water_rate) || parsedSettings?.water_rate || 50,
      elec_prev_reading: parseFloat(billFormData.elec_prev_reading) || 0,
      elec_current_reading: parseFloat(billFormData.elec_current_reading) || 0,
      elec_rate: parseFloat(billFormData.elec_rate) || parsedSettings?.elec_rate || 15,
      rent_amount: rentAmount,
      arrears_brought_forward: arrears,
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

    // Fetch settings directly to ensure we have the latest values
    const storedSettings = localStorage.getItem('app-settings')
    const parsedSettings = storedSettings ? JSON.parse(storedSettings) : null
    
    const rentAmount = parseFloat(billFormData.rent_amount) || selectedUnit.monthly_rent || 0
    const arrearsAmount = parseFloat(billFormData.arrears_brought_forward) || 0

    const billData = {
      unit_id: selectedUnitForBill,
      tenant_id: selectedUnit.tenants?.id || null,
      billing_month: selectedMonth + '-01',
      water_prev_reading: parseFloat(billFormData.water_prev_reading) || 0,
      water_current_reading: parseFloat(billFormData.water_current_reading) || 0,
      water_rate: parseFloat(billFormData.water_rate) || parsedSettings?.water_rate || 50,
      elec_prev_reading: parseFloat(billFormData.elec_prev_reading) || 0,
      elec_current_reading: parseFloat(billFormData.elec_current_reading) || 0,
      elec_rate: parseFloat(billFormData.elec_rate) || parsedSettings?.elec_rate || 15,
      rent_amount: rentAmount,
      arrears_brought_forward: arrearsAmount,
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
      setError(friendlyErrorMessage(insertError, 'Failed to create bill'))
      return
    }

    // Ensure status is synced using DB-calculated values (in case generated columns change status)
    try {
      if (insertedBill?.id) await syncBillStatus(insertedBill.id)
    } catch (err) {
      console.warn('Failed to sync status for newly created bill:', err)
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
      water_rate: '',
      elec_prev_reading: '',
      elec_current_reading: '',
      elec_rate: '',
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
    const advanceCredit = await fetchAdvanceCreditForMonthAndUnit(selectedMonth + '-01', selectedUnitForBill)
    const arrears = prevBalance - advanceCredit

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
      // Allow negative prevBalance (overpayments) to be carried forward as negative arrears
      arrears_brought_forward: arrears,
      garbage_amount: garbageAmount,
      maintenance_amount: maintenanceAmount,
      other_utilities_amount: otherUtilitiesAmount,
      amount_paid: 0,
      status: 'pending' as const,
    }

    createUtilityBillMutation.mutate(billData)
  }

  const fetchUtilityBillItemsForBill = async (billId: string) => {
    const { data, error } = await supabase
      .from('utility_bill_items')
      .select('id,bill_id,units_consumed,rate,amount,utility_types(id,name)')
      .eq('bill_id', billId)

    if (error) {
      console.error('Failed to load utility bill items for invoice:', error)
      return []
    }

    return data || []
  }

  const fetchUtilityBillItemsForBills = async (billIds: string[]) => {
    if (!billIds.length) return []

    const { data, error } = await supabase
      .from('utility_bill_items')
      .select('id,bill_id,units_consumed,rate,amount,utility_types(id,name)')
      .in('bill_id', billIds)

    if (error) {
      console.error('Failed to load utility bill items for bulk invoice:', error)
      return []
    }

    return data || []
  }

  const handlePrintBill = async (bill: any) => {
    try {
      const [building_payment, utility_bill_items] = await Promise.all([
        bill.unit_id ? fetchBuildingPaymentByUnitId(bill.unit_id) : Promise.resolve(null),
        bill.id ? fetchUtilityBillItemsForBill(bill.id) : Promise.resolve([]),
      ])
      await generateInvoicePDF({ ...bill, building_payment, utility_bill_items })
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
      const billIds = (bills || []).map((b: any) => b.id).filter(Boolean)
      const allItems = await fetchUtilityBillItemsForBills(billIds)
      const enriched = await Promise.all(
        (bills || []).map(async (b: any) => ({
          ...b,
          building_payment: b.unit_id ? await fetchBuildingPaymentByUnitId(b.unit_id) : null,
          utility_bill_items: allItems.filter((item: any) => item.bill_id === b.id),
        }))
      )
      await generateBulkInvoicesPDF(enriched)
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
    setExportBillsToUse(bills)
    setShowExportModal(true)
  }

  const handleExportWithSelectedColumns = (selectedColumns: string[]) => {
    if (!exportBillsToUse || exportBillsToUse.length === 0) {
      setError('No bills to export')
      return
    }
    try {
      const monthName = formatMonth(selectedMonth).replace(/\s+/g, '-')
      exportBillsToExcel(exportBillsToUse, `bills-${monthName}`, selectedColumns)
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
            disabled={!!occupiedUnitsError || !occupiedUnits || occupiedUnits.length === 0}
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
            onClick={() => setShowPaymentModal(true)}
            className="btn btn-secondary"
            title="Payment Info (paybill/account)"
          >
            <Receipt size={18} />
            <span className="hidden sm:inline">Payment Info</span>
            <span className="sm:hidden">PayInfo</span>
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

      <div className="p-3 flex items-center justify-end">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search bills..."
          className="input w-64"
        />
      </div>

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
                  {filteredBills.map((bill: any) => {
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
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete bill for ${bill.units?.unit_number} (${bill.billing_month})? This action cannot be undone.`)) return
                                try {
                                  const { error } = await supabase.from('bills').delete().eq('id', bill.id)
                                  if (error) throw error
                                  await queryClient.invalidateQueries({ queryKey: ['bills', selectedMonth] })
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to delete bill')
                                }
                              }}
                              className="p-1 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                              title="Delete Bill"
                            >
                              <X size={12} />
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
              
              {/* Rate inputs for bulk generation */}
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Water Rate (KES/unit)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bulkRates.water_rate}
                    onChange={(e) => setBulkRates({ ...bulkRates, water_rate: e.target.value })}
                    className="input"
                    placeholder={settings?.water_rate?.toString() || "50"}
                  />
                  <p className="text-xs text-slate-500 mt-1">Applied to all units when generating bills</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Electricity Rate (KES/unit)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={bulkRates.elec_rate}
                    onChange={(e) => setBulkRates({ ...bulkRates, elec_rate: e.target.value })}
                    className="input"
                    placeholder={settings?.elec_rate?.toString() || "15"}
                  />
                  <p className="text-xs text-slate-500 mt-1">Applied to all units when generating bills</p>
                </div>
              </div>
            
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
                            step="0.01"
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
                            step="0.01"
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
                            step="0.01"
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
                            step="0.01"
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
                    setBulkRates({ water_rate: '', elec_rate: '' })
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
          setEditingBillTenantId('')
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
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Tenant for this bill
                    </label>
                    <select
                      value={editingBillTenantId}
                      onChange={(e) => setEditingBillTenantId(e.target.value)}
                      className="input"
                    >
                      <option value="">No tenant selected</option>
                      {(tenantsForEditingUnit || []).map((tenant: any) => (
                        <option key={tenant.id} value={tenant.id}>
                          {tenant.name}{tenant.status && tenant.status !== 'active' ? ` (${tenant.status})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Only tenants assigned to this unit are listed; current bill tenant is included for historical correction.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Previous Reading <span className="text-xs text-slate-500 font-normal">(Auto-filled — editable)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, water_prev_reading: e.target.value })}
                      className="input"
                      title="Previous reading (editable)"
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
                      onChange={(e) => {
                        const currentReading = e.target.value
                        setBillFormData({ ...billFormData, water_current_reading: currentReading })
                      }}
                      className="input"
                      required
                    />
                    {billFormData.water_current_reading && billFormData.water_prev_reading && (
                      <p className="text-xs text-slate-500 mt-1">
                        Units: {Math.max(0, parseFloat(billFormData.water_current_reading) - parseFloat(billFormData.water_prev_reading)).toFixed(2)} × {billFormData.water_rate || settings?.water_rate || 50} = {formatCurrency(Math.max(0, parseFloat(billFormData.water_current_reading) - parseFloat(billFormData.water_prev_reading)) * parseFloat(billFormData.water_rate || settings?.water_rate || 50))}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billFormData.water_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, water_rate: e.target.value })}
                      className="input"
                      placeholder={settings?.water_rate?.toString() || "50"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Previous Reading <span className="text-xs text-slate-500 font-normal">(Auto-filled — editable)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_prev_reading: e.target.value })}
                      className="input"
                      title="Previous reading (editable)"
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
                      onChange={(e) => {
                        const currentReading = e.target.value
                        setBillFormData({ ...billFormData, elec_current_reading: currentReading })
                      }}
                      className="input"
                      required
                    />
                    {billFormData.elec_current_reading && billFormData.elec_prev_reading && (
                      <p className="text-xs text-slate-500 mt-1">
                        Units: {Math.max(0, parseFloat(billFormData.elec_current_reading) - parseFloat(billFormData.elec_prev_reading)).toFixed(2)} × {billFormData.elec_rate || settings?.elec_rate || 15} = {formatCurrency(Math.max(0, parseFloat(billFormData.elec_current_reading) - parseFloat(billFormData.elec_prev_reading)) * parseFloat(billFormData.elec_rate || settings?.elec_rate || 15))}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billFormData.elec_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_rate: e.target.value })}
                      className="input"
                      placeholder={settings?.elec_rate?.toString() || "15"}
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
                              // Preserve negative balances (overpayments) as negative strings
                              arrears_brought_forward: prevBalance !== undefined && prevBalance !== null ? prevBalance.toString() : '0'
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

                        // Fetch latest meter readings for this unit
                        const latestReadings = await fetchLatestMeterReadings(unit.id)
                        newFormData.water_prev_reading = latestReadings.water.toString()
                        newFormData.elec_prev_reading = latestReadings.elec.toString()

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

                        const advanceCredit = await fetchAdvanceCreditForMonthAndUnit(selectedMonth + '-01', unit.id)
                        const computedArrears = (prevBill && typeof prevBill.balance !== 'undefined' && prevBill.balance !== null ? prevBill.balance : 0) - advanceCredit

                        // Preserve negative balances (overpayment) as negative arrears when present
                        newFormData.arrears_brought_forward = computedArrears.toString()

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
                      Water Previous Reading <span className="text-xs text-slate-500 font-normal">(Auto-filled — editable)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, water_prev_reading: e.target.value })}
                      className="input"
                      title="Automatically filled from the most recent bill for this unit (editable)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Current Reading <span className="text-xs text-green-600 font-normal">(Enter current)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.water_current_reading}
                      onChange={(e) => {
                        const currentReading = e.target.value
                        setBillFormData({ ...billFormData, water_current_reading: currentReading })
                      }}
                      className="input"
                      required
                      placeholder="Enter current reading"
                    />
                    {billFormData.water_current_reading && billFormData.water_prev_reading && (
                      <p className="text-xs text-slate-500 mt-1">
                        Units: {Math.max(0, parseFloat(billFormData.water_current_reading) - parseFloat(billFormData.water_prev_reading)).toFixed(2)} × {billFormData.water_rate || settings?.water_rate || 50} = {formatCurrency(Math.max(0, parseFloat(billFormData.water_current_reading) - parseFloat(billFormData.water_prev_reading)) * parseFloat(billFormData.water_rate || settings?.water_rate || 50))}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Water Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billFormData.water_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, water_rate: e.target.value })}
                      className="input"
                      placeholder={settings?.water_rate?.toString() || "50"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Previous Reading <span className="text-xs text-slate-500 font-normal">(Auto-filled — editable)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_prev_reading}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_prev_reading: e.target.value })}
                      className="input"
                      title="Automatically filled from the most recent bill for this unit (editable)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Current Reading <span className="text-xs text-green-600 font-normal">(Enter current)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFormData.elec_current_reading}
                      onChange={(e) => {
                        const currentReading = e.target.value
                        setBillFormData({ ...billFormData, elec_current_reading: currentReading })
                      }}
                      className="input"
                      required
                      placeholder="Enter current reading"
                    />
                    {billFormData.elec_current_reading && billFormData.elec_prev_reading && (
                      <p className="text-xs text-slate-500 mt-1">
                        Units: {Math.max(0, parseFloat(billFormData.elec_current_reading) - parseFloat(billFormData.elec_prev_reading)).toFixed(2)} × {billFormData.elec_rate || settings?.elec_rate || 15} = {formatCurrency(Math.max(0, parseFloat(billFormData.elec_current_reading) - parseFloat(billFormData.elec_prev_reading)) * parseFloat(billFormData.elec_rate || settings?.elec_rate || 15))}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Electricity Rate (KES/unit)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billFormData.elec_rate}
                      onChange={(e) => setBillFormData({ ...billFormData, elec_rate: e.target.value })}
                      className="input"
                      placeholder={settings?.elec_rate?.toString() || "15"}
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

      {showPaymentModal && (
        <div className="modal-overlay" onClick={() => { setShowPaymentModal(false) }}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Details</h2>
              <p className="text-sm text-slate-600 mb-4">Set default payment method, paybill and account number to appear on generated invoices and receipts.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Method</label>
                  <select
                    value={paymentFormData.payment_method}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, payment_method: e.target.value }))}
                    className="input"
                  >
                    <option value="">Select method</option>
                    <option value="M-PESA">M-PESA</option>
                    <option value="Airtel Money">Airtel Money</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Paybill</label>
                  <input
                    type="text"
                    value={paymentFormData.paybill}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, paybill: e.target.value }))}
                    className="input"
                    placeholder="e.g. 123456"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Account Number / Description</label>
                  <input
                    type="text"
                    value={paymentFormData.account_number}
                    onChange={(e) => setPaymentFormData(prev => ({ ...prev, account_number: e.target.value }))}
                    className="input"
                    placeholder="e.g. ACC-1001 or tenant name"
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={savePaymentSettings}
                    className="flex-1 btn btn-primary"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Columns Modal */}
      <ExportColumnsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportWithSelectedColumns}
        availableColumns={Object.keys({
          'Invoice #': '',
          'Billing Month': '',
          'Unit Number': '',
          'Building Name': '',
          'Tenant Name': '',
          'Tenant Phone': '',
          'Water Previous Reading': '',
          'Water Current Reading': '',
          'Water Units Consumed': '',
          'Water Rate (per unit)': '',
          'Water Amount': '',
          'Electricity Previous Reading': '',
          'Electricity Current Reading': '',
          'Electricity Units Consumed': '',
          'Electricity Rate (per unit)': '',
          'Electricity Amount': '',
          'Monthly Rent': '',
          'Garbage Amount': '',
          'Maintenance Amount': '',
          'Other Utilities Amount': '',
          'Total Utilities': '',
          'Arrears Brought Forward': '',
          'Total Amount': '',
          'Amount Paid': '',
          'Balance': '',
          'Status': '',
          'Created Date': '',
          'Updated Date': '',
        }).map(col => ({ id: col, label: col, category: '' }))}
      />
    </div>
  )
}

