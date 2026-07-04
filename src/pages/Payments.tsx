import { useState, useMemo, useCallback, useEffect, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Download, DollarSign, CheckCircle } from 'lucide-react'
import { generateReceiptPDF } from '@/lib/pdf'
import { compareByBuildingThenUnit } from '@/lib/property-sort'
import { fetchBuildingPaymentByUnitId, readGlobalPaymentSettings, resolvePaymentInstructions, buildingHasPaymentOverride } from '@/lib/payment-instructions'
import {
  applyUnappliedAdvanceCreditsToBill,
  reconcileAllPendingAdvanceCredits,
} from '@/lib/advance-payments'

function billingMonthKey(billingMonth: string): string {
  const d = new Date(billingMonth)
  if (Number.isNaN(d.getTime())) return billingMonth.slice(0, 7)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextCalendarMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  let nm = m + 1
  let ny = y
  if (nm > 12) {
    nm = 1
    ny += 1
  }
  return `${ny}-${String(nm).padStart(2, '0')}`
}

type ApplyPaymentParams = {
  targetBillId: string
  unitId: string
  tenantId: string
  amount: number
  paymentMethod: 'cash' | 'mpesa' | 'bank'
  receiptUrl?: string
  notes?: string
  paymentDate?: string
}

async function applyPaymentToBill(params: ApplyPaymentParams) {
  const { data: billRow, error: fetchErr } = await supabase
    .from('bills')
    .select('amount_paid')
    .eq('id', params.targetBillId)
    .single()

  if (fetchErr || !billRow) {
    throw fetchErr || new Error('Bill not found')
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert([
      {
        bill_id: params.targetBillId,
        unit_id: params.unitId,
        tenant_id: params.tenantId,
        amount: params.amount,
        payment_method: params.paymentMethod,
        receipt_url: params.receiptUrl,
        payment_date: params.paymentDate ?? new Date().toISOString(),
        notes: params.notes,
      },
    ])
    .select()
    .single()

  if (paymentError) throw paymentError

  const newAmountPaid = (billRow.amount_paid || 0) + params.amount
  const { error: billError } = await supabase
    .from('bills')
    .update({ amount_paid: newAmountPaid })
    .eq('id', params.targetBillId)

  if (billError) throw billError

  const { data: freshBill, error: freshError } = await supabase
    .from('bills')
    .select('total_amount, amount_paid, balance, status')
    .eq('id', params.targetBillId)
    .single()

  if (!freshError && freshBill) {
    const total = freshBill.total_amount || 0
    const paid = freshBill.amount_paid || 0
    const balance = typeof freshBill.balance === 'number' ? freshBill.balance : total - paid
    const EPS = 0.0001
    const computedStatus = balance <= EPS ? 'paid' : paid > 0 ? 'partial' : 'pending'

    if (computedStatus !== freshBill.status) {
      const { error: statusErr } = await supabase
        .from('bills')
        .update({ status: computedStatus })
        .eq('id', params.targetBillId)
      if (statusErr) console.warn('Failed to sync bill status:', statusErr)
    }
  }

  return payment
}

async function recordAdvancePayment(params: {
  unitId: string
  tenantId: string
  amount: number
  paymentMethod: 'cash' | 'mpesa' | 'bank'
  receiptUrl?: string
  notes?: string
  paymentDate?: string
  targetMonth: string
}) {
  const { data: advancePayment, error } = await supabase
    .from('advance_payments')
    .insert([
      {
        unit_id: params.unitId,
        tenant_id: params.tenantId,
        target_month: params.targetMonth,
        amount: params.amount,
        payment_method: params.paymentMethod,
        receipt_url: params.receiptUrl,
        payment_date: params.paymentDate ?? new Date().toISOString(),
        notes: params.notes,
      },
    ])
    .select()
    .single()

  if (error) throw error

  // If a bill already exists for the target month, apply the credit immediately
  const targetMonth = params.targetMonth.length === 7 ? `${params.targetMonth}-01` : params.targetMonth
  const { data: existingBill } = await supabase
    .from('bills')
    .select('id')
    .eq('unit_id', params.unitId)
    .eq('billing_month', targetMonth)
    .maybeSingle()

  if (existingBill?.id) {
    await applyUnappliedAdvanceCreditsToBill(existingBill.id, params.unitId, targetMonth)
  }

  return advancePayment
}

export default function Payments() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'unit' | 'tenant'>('unit')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [selectedBuildingId, setSelectedBuildingId] = useState('')
  const [advanceSearch, setAdvanceSearch] = useState('')
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState<'all' | 'pending' | 'applied'>('all')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [unitsList, setUnitsList] = useState<any[]>([])
  const [tenantsList, setTenantsList] = useState<any[]>([])
  const [paymentMode, setPaymentMode] = useState<'current' | 'advance'>('current')
  const [advanceTargetMonth, setAdvanceTargetMonth] = useState('')
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([])
  const [rowAmounts, setRowAmounts] = useState<Record<string, string>>({})
  const [fillAllValue, setFillAllValue] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'bank'>('cash')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const queryClient = useQueryClient()

  const { data: pendingBills, error: pendingBillsError, isLoading: pendingBillsLoading } = useQuery({
    queryKey: ['pending-bills', selectedMonth],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      const parts = selectedMonth.split('-').map(Number)
      const py = parts[0]
      const pm = parts[1]
      let ny = py
      let nm = pm + 1
      if (nm > 12) {
        nm = 1
        ny = py + 1
      }
      const startDate = `${py}-${String(pm).padStart(2, '0')}-01`
      const nextMonthFirst = `${ny}-${String(nm).padStart(2, '0')}-01`

      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .neq('status', 'paid')
        .gte('billing_month', startDate)
        .lt('billing_month', nextMonthFirst)
        .order('created_at', { ascending: false })

      if (billsError) {
        console.error('Pending bills query error:', billsError)
        throw billsError
      }

      if (!billsData || billsData.length === 0) {
        console.log('No pending bills found for this month')
        return []
      }

      const billsWithRelations = await Promise.all(
        billsData.map(async (bill: any) => {
          const [unitRes, tenantRes] = await Promise.all([
            bill.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id, monthly_rent')
                  .eq('id', bill.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            bill.tenant_id
              ? supabase
                  .from('tenants')
                  .select('name, phone')
                  .eq('id', bill.tenant_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
          ])

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
            building_id: unitRes.data?.building_id ?? null,
            units: unitRes.data
              ? {
                  unit_number: unitRes.data.unit_number,
                  building_id: unitRes.data.building_id,
                  monthly_rent: unitRes.data.monthly_rent,
                  buildings: buildingName ? { name: buildingName } : null,
                }
              : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name, phone: tenantRes.data.phone } : null,
          }
        })
      )

      billsWithRelations.sort(compareByBuildingThenUnit)

      return billsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const pendingBillsForBuilding = useMemo(() => {
    if (!pendingBills?.length) return []
    if (!selectedBuildingId) return pendingBills
    return pendingBills.filter((b: any) => b.building_id === selectedBuildingId)
  }, [pendingBills, selectedBuildingId])

  const advanceTenantRows = useMemo(() => {
    const rows = (tenantsList || []).map((tenant: any) => {
      const unit = unitsList.find((u) => u.id === tenant.unit_id)
      return {
        id: tenant.id,
        name: tenant.name,
        unit_id: tenant.unit_id,
        unit_number: unit?.unit_number || null,
        building_id: unit?.building_id || null,
        building: unit?.building || null,
        monthly_rent: unit?.monthly_rent ?? null,
      }
    })
    if (!selectedBuildingId) return rows
    return rows.filter((row) => row.building_id === selectedBuildingId)
  }, [tenantsList, unitsList, selectedBuildingId])

  const { data: payments, error: paymentsError, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', selectedMonth],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      const parts = selectedMonth.split('-').map(Number)
      const py = parts[0]
      const pm = parts[1]
      let ny = py
      let nm = pm + 1
      if (nm > 12) {
        nm = 1
        ny = py + 1
      }
      const startDate = `${py}-${String(pm).padStart(2, '0')}-01`
      const nextMonthFirst = `${ny}-${String(nm).padStart(2, '0')}-01`

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .gte('payment_date', startDate)
        .lt('payment_date', nextMonthFirst)
        .order('payment_date', { ascending: false })
        .limit(500)

      if (paymentsError) {
        console.error('Payments query error:', paymentsError)
        throw paymentsError
      }

      if (!paymentsData || paymentsData.length === 0) {
        console.log('No payments found')
        return []
      }

      console.log('Payments fetched:', paymentsData.length, 'payments')

      const paymentsWithRelations = await Promise.all(
        paymentsData.map(async (payment: any) => {
          const [billRes, unitRes, tenantRes] = await Promise.all([
            payment.bill_id
              ? supabase
                  .from('bills')
                  .select('billing_month')
                  .eq('id', payment.bill_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            payment.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', payment.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            payment.tenant_id
              ? supabase
                  .from('tenants')
                  .select('name')
                  .eq('id', payment.tenant_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
          ])

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
            ...payment,
            bills: billRes.data ? { billing_month: billRes.data.billing_month } : null,
            units: unitRes.data
              ? {
                  unit_number: unitRes.data.unit_number,
                  building_id: unitRes.data.building_id,
                  buildings: buildingName ? { name: buildingName } : null,
                }
              : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null,
          }
        })
      )

      return paymentsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: advancePayments, error: advancePaymentsError, isLoading: advancePaymentsLoading } = useQuery({
    queryKey: ['advance-payments'],
    queryFn: async () => {
      // Apply any pending advance credits to existing bills before listing
      try {
        const applied = await reconcileAllPendingAdvanceCredits()
        if (applied > 0) {
          console.log('Reconciled advance credits on load:', applied)
        }
      } catch (err) {
        console.warn('Failed to reconcile pending advance credits:', err)
      }

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('advance_payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (paymentsError) {
        console.error('Advance payments query error:', paymentsError)
        throw paymentsError
      }

      if (!paymentsData || paymentsData.length === 0) {
        return []
      }

      const paymentsWithRelations = await Promise.all(
        paymentsData.map(async (payment: any) => {
          const [tenantRes, unitRes, billRes] = await Promise.all([
            payment.tenant_id
              ? supabase.from('tenants').select('name').eq('id', payment.tenant_id).single()
              : Promise.resolve({ data: null, error: null }),
            payment.unit_id
              ? supabase.from('units').select('unit_number,building_id').eq('id', payment.unit_id).single()
              : Promise.resolve({ data: null, error: null }),
            payment.applied_bill_id
              ? supabase.from('bills').select('billing_month').eq('id', payment.applied_bill_id).single()
              : Promise.resolve({ data: null, error: null }),
          ])

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
            ...payment,
            tenant_name: tenantRes.data?.name || 'Unknown tenant',
            unit_number: unitRes.data?.unit_number || 'Unknown unit',
            building_id: unitRes.data?.building_id ?? null,
            building_name: buildingName,
            applied_bill: billRes.data ? { billing_month: billRes.data.billing_month } : null,
          }
        })
      )

      return paymentsWithRelations
    },
    staleTime: 1000 * 60 * 5,
  })

  const filteredAdvancePayments = useMemo(() => {
    if (!advancePayments?.length) return []

    return advancePayments.filter((payment: any) => {
      if (selectedBuildingId) {
        if (payment.building_id !== selectedBuildingId) {
          return false
        }
      }

      if (advanceStatusFilter !== 'all') {
        const isApplied = Boolean(payment.applied_at)
        if (advanceStatusFilter === 'applied' && !isApplied) return false
        if (advanceStatusFilter === 'pending' && isApplied) return false
      }

      if (!advanceSearch) return true
      const searchLower = advanceSearch.toLowerCase()
      return [
        payment.tenant_name,
        payment.unit_number,
        payment.building_name,
        payment.notes,
        payment.payment_method,
      ]
        .filter(Boolean)
        .some((value: string) => value.toLowerCase().includes(searchLower))
    })
  }, [advancePayments, selectedBuildingId, advanceStatusFilter, advanceSearch])

  const advancePaymentsSummary = useMemo(() => {
    const total = (filteredAdvancePayments || []).reduce((sum: number, payment: any) => sum + Number(payment.amount || 0), 0)
    return {
      count: filteredAdvancePayments?.length || 0,
      total,
      applied: filteredAdvancePayments?.filter((payment: any) => Boolean(payment.applied_at)).length || 0,
      pending: filteredAdvancePayments?.filter((payment: any) => !payment.applied_at).length || 0,
    }
  }, [filteredAdvancePayments])

  useQuery({
    queryKey: ['units-list'],
    queryFn: async () => {
      const { data: unitsData, error } = await supabase
        .from('units')
        .select('id,unit_number,building_id,monthly_rent')
        .order('unit_number', { ascending: false })
      if (error) throw error

      const unitsWithBuildings = await Promise.all(
        (unitsData || []).map(async (u: any) => {
          let buildingName = null
          if (u.building_id) {
            const { data: b } = await supabase.from('buildings').select('name').eq('id', u.building_id).single()
            buildingName = b?.name || null
          }
          return { id: u.id, unit_number: u.unit_number, building_id: u.building_id, building: buildingName }
        })
      )

      setUnitsList(unitsWithBuildings)
      return unitsWithBuildings
    },
    staleTime: 1000 * 60 * 5,
  })

  useQuery({
    queryKey: ['tenants-list'],
    queryFn: async () => {
      const { data: tenantsData, error } = await supabase.from('tenants').select('id,name,unit_id').order('name')
      if (error) throw error
      setTenantsList(tenantsData || [])
      return tenantsData || []
    },
    staleTime: 1000 * 60 * 5,
  })

  const { data: paymentsByEntity, isLoading: _paymentsByEntityLoading } = useQuery({
    queryKey: ['payments-by-entity', filterType, selectedEntityId, selectedMonth],
    enabled: !!selectedEntityId,
    queryFn: async () => {
      const field = filterType === 'unit' ? 'unit_id' : 'tenant_id'
      const parts = selectedMonth.split('-').map(Number)
      const py = parts[0]
      const pm = parts[1]
      let ny = py
      let nm = pm + 1
      if (nm > 12) {
        nm = 1
        ny = py + 1
      }
      const startDate = `${py}-${String(pm).padStart(2, '0')}-01`
      const nextMonthFirst = `${ny}-${String(nm).padStart(2, '0')}-01`

      const { data: paymentsData, error } = await supabase
        .from('payments')
        .select('*')
        .eq(field, selectedEntityId)
        .gte('payment_date', startDate)
        .lt('payment_date', nextMonthFirst)
        .order('payment_date', { ascending: false })
      if (error) throw error

      const withRelations = await Promise.all(
        (paymentsData || []).map(async (p: any) => {
          const [billRes, unitRes, tenantRes] = await Promise.all([
            p.bill_id ? supabase.from('bills').select('billing_month').eq('id', p.bill_id).single() : Promise.resolve({ data: null }),
            p.unit_id ? supabase.from('units').select('unit_number,building_id').eq('id', p.unit_id).single() : Promise.resolve({ data: null }),
            p.tenant_id ? supabase.from('tenants').select('name').eq('id', p.tenant_id).single() : Promise.resolve({ data: null }),
          ])
          let buildingName = null
          if (unitRes.data?.building_id) {
            const { data: b } = await supabase.from('buildings').select('name').eq('id', unitRes.data.building_id).single()
            buildingName = b?.name || null
          }
          return {
            ...p,
            bills: billRes.data ? { billing_month: billRes.data.billing_month } : null,
            units: unitRes.data
              ? {
                  unit_number: unitRes.data.unit_number,
                  building_id: unitRes.data.building_id,
                  buildings: buildingName ? { name: buildingName } : null,
                }
              : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null,
          }
        })
      )

      return withRelations
    },
  })

  const { data: buildingsList = [] } = useQuery({
    queryKey: ['buildings-list-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id,name,payment_method_label,payment_paybill,payment_account_number,payment_notes')
        .order('name')
      if (error) throw error
      return data || []
    },
    staleTime: 1000 * 60 * 5,
  })

  const selectedBuildingRow = useMemo(
    () => (buildingsList as any[]).find((x) => x.id === selectedBuildingId) ?? null,
    [buildingsList, selectedBuildingId]
  )

  const filteredUnitsForSelect = useMemo(() => {
    if (!selectedBuildingId) return unitsList
    return unitsList.filter((u: any) => u.building_id === selectedBuildingId)
  }, [unitsList, selectedBuildingId])

  const filteredTenantsForSelect = useMemo(() => tenantsList, [tenantsList])

  useEffect(() => {
    if (!selectedEntityId) return
    if (filterType === 'unit') {
      if (!filteredUnitsForSelect.some((u: any) => u.id === selectedEntityId)) {
        setSelectedEntityId('')
      }
    } else if (!filteredTenantsForSelect.some((t: any) => t.id === selectedEntityId)) {
      setSelectedEntityId('')
    }
  }, [filterType, selectedEntityId, filteredUnitsForSelect, filteredTenantsForSelect])

  const paymentsSummary = (paymentsByEntity || []).reduce(
    (acc: any, p: any) => {
      acc.total = (acc.total || 0) + (p.amount || 0)
      acc.count = (acc.count || 0) + 1
      acc.last = acc.last || p.payment_date
      return acc
    },
    { total: 0, count: 0, last: null }
  )

  const buildingPaymentsSummary = useMemo(() => {
    if (!selectedBuildingId || payments === undefined) return null
    const rows = payments.filter((p: any) => p.units?.building_id === selectedBuildingId)
    return rows.reduce(
      (acc: any, p: any) => {
        acc.total = (acc.total || 0) + (p.amount || 0)
        acc.count = (acc.count || 0) + 1
        acc.last = acc.last || p.payment_date
        return acc
      },
      { total: 0, count: 0, last: null }
    )
  }, [selectedBuildingId, payments])

  const filteredPayments = (payments || []).filter((p: any) => {
    if (selectedBuildingId && p.units?.building_id !== selectedBuildingId) return false
    if (selectedEntityId) {
      if (filterType === 'unit' && p.unit_id !== selectedEntityId) return false
      if (filterType === 'tenant' && p.tenant_id !== selectedEntityId) return false
    }
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (p.tenants?.name || '').toLowerCase().includes(q) ||
      (p.units?.unit_number || '').toString().toLowerCase().includes(q) ||
      (p.units?.buildings?.name || '').toLowerCase().includes(q) ||
      (p.bills?.billing_month || '').toString().toLowerCase().includes(q) ||
      (p.payment_method || '').toLowerCase().includes(q)
    )
  })

  const uploadReceipt = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `receipts/${Math.random()}.${fileExt}`
    const { data, error } = await supabase.storage.from('receipts').upload(fileName, file)

    if (error) throw error
    const {
      data: { publicUrl },
    } = supabase.storage.from('receipts').getPublicUrl(data.path)
    return publicUrl
  }

  type BulkMutationResult = {
    results: any[]
    errors: { unitLabel: string; message: string }[]
  }

  const createPaymentMutation = useMutation({
    mutationFn: async (
      items: Array<
        ApplyPaymentParams & {
          unitLabel: string
          isAdvance?: boolean
          targetMonth?: string
        }
      >
    ): Promise<BulkMutationResult> => {
      const results: any[] = []
      const errors: { unitLabel: string; message: string }[] = []

      for (const item of items) {
        const { unitLabel, isAdvance, targetMonth, ...applyParams } = item
        try {
          const p = isAdvance
            ? await recordAdvancePayment({
                unitId: applyParams.unitId,
                tenantId: applyParams.tenantId,
                amount: applyParams.amount,
                paymentMethod: applyParams.paymentMethod,
                receiptUrl: applyParams.receiptUrl,
                paymentDate: applyParams.paymentDate,
                notes: applyParams.notes,
                targetMonth: targetMonth || '',
              })
            : await applyPaymentToBill(applyParams)
          results.push(p)
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Unknown error'
          errors.push({ unitLabel, message })
        }
      }

      return { results, errors }
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['payments'] })
      await queryClient.invalidateQueries({ queryKey: ['advance-payments'] })
      await queryClient.invalidateQueries({ queryKey: ['pending-bills'] })
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['bills-for-month-units'] })
      await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
      await queryClient.invalidateQueries({ queryKey: ['revenue-report'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })

      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['pending-bills'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['bills'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['payments'], type: 'active' }),
      ])

      if (data.results.length === 0) {
        alert(
          data.errors.length
            ? data.errors.map((e) => `${e.unitLabel}: ${e.message}`).join('\n')
            : 'No payments were recorded.'
        )
        return
      }

      let msg = `Recorded ${data.results.length} payment(s) successfully.`
      if (data.errors.length > 0) {
        msg += ` ${data.errors.length} failed (see alert).`
        alert(data.errors.map((e) => `${e.unitLabel}: ${e.message}`).join('\n'))
      }
      setSuccessMessage(msg)
      setShowSuccessAlert(true)
      setTimeout(() => setShowSuccessAlert(false), 5000)

      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: unknown) => {
      console.error('Failed to create payment:', error)
      const message = error instanceof Error ? error.message : 'Failed to record payment.'
      alert(message)
    },
  })

  const resetForm = useCallback(() => {
    setPaymentMode('current')
    setAdvanceTargetMonth(nextCalendarMonth(selectedMonth))
    setSelectedBillIds([])
    setRowAmounts({})
    setFillAllValue('')
    setPaymentMethod('cash')
    setReceiptFile(null)
    setNotes('')
  }, [selectedMonth])

  const openRecordModal = () => {
    queryClient.refetchQueries({ queryKey: ['pending-bills'] })
    setPaymentMode('current')
    setAdvanceTargetMonth(nextCalendarMonth(selectedMonth))
    setSelectedBillIds([])
    setRowAmounts({})
    setFillAllValue('')
    setPaymentMethod('cash')
    setReceiptFile(null)
    setNotes('')
    setIsModalOpen(true)
  }

  const toggleBillSelection = (rowId: string, row: any) => {
    setSelectedBillIds((prev: string[]) => {
      const on = prev.includes(rowId)
      if (on) {
        return prev.filter((id: string) => id !== rowId)
      }
      const defaultBal = row.balance != null ? row.balance : row.monthly_rent
      setRowAmounts((ra: Record<string, string>) => ({
        ...ra,
        [rowId]: ra[rowId] ?? (defaultBal != null ? String(defaultBal) : ''),
      }))
      return [...prev, rowId]
    })
  }

  const updateRowAmount = (billId: string, value: string) => {
    setRowAmounts((prev: Record<string, string>) => ({ ...prev, [billId]: value }))
  }

  const applyFillAllToSelected = () => {
    const v = fillAllValue.trim()
    if (!v || selectedBillIds.length === 0) return
    setRowAmounts((prev: Record<string, string>) => {
      const next = { ...prev }
      for (const id of selectedBillIds) {
        next[id] = v
      }
      return next
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (paymentMode === 'advance' && !advanceTargetMonth) {
      alert('Choose a target month for the advance payment.')
      return
    }

    const selectedItems =
      paymentMode === 'advance'
        ? advanceTenantRows.filter((row) => selectedBillIds.includes(row.id))
        : (pendingBillsForBuilding || []).filter((bill: any) => selectedBillIds.includes(bill.id))

    if (selectedItems.length === 0) {
      alert(paymentMode === 'advance' ? 'Select at least one tenant.' : 'Select at least one bill.')
      return
    }

    const items: Array<ApplyPaymentParams & { unitLabel: string; isAdvance?: boolean; targetMonth?: string }> = []
    const preErrors: string[] = []

    for (const item of selectedItems) {
      const unitLabel =
        paymentMode === 'advance'
          ? `${item.name ?? 'Tenant'} — ${item.unit_number ?? 'No unit'}`
          : `${item.units?.unit_number ?? '?'} — ${item.tenants?.name ?? 'N/A'}`
      const rowId = item.id
      const raw = rowAmounts[rowId] ?? ''
      const amt = parseFloat(raw)
      if (!raw.trim() || Number.isNaN(amt) || amt <= 0) {
        preErrors.push(`${unitLabel}: enter a valid amount.`)
        continue
      }

      let targetBillId = paymentMode === 'advance' ? '' : item.id
      let tenantId = paymentMode === 'advance' ? item.id : item.tenant_id || ''
      let unitId = item.unit_id

      if (paymentMode === 'advance') {
        if (!unitId) {
          preErrors.push(`${unitLabel}: tenant has no assigned unit; cannot record advance payment.`)
          continue
        }
      }

      if (!tenantId) {
        preErrors.push(`${unitLabel}: missing tenant; cannot record payment.`)
        continue
      }

      const baseNotes = notes.trim()
      const combinedNotes =
        paymentMode === 'advance'
          ? [baseNotes, `Advance credit for ${advanceTargetMonth}`].filter(Boolean).join(' — ')
          : baseNotes || undefined

      items.push({
        targetBillId,
        unitId,
        tenantId,
        amount: amt,
        paymentMethod,
        notes: combinedNotes,
        unitLabel,
        isAdvance: paymentMode === 'advance',
        targetMonth: paymentMode === 'advance' ? `${advanceTargetMonth}-01` : undefined,
      })
    }

    if (preErrors.length > 0 && items.length === 0) {
      alert(preErrors.join('\n'))
      return
    }
    if (preErrors.length > 0) {
      const ok = window.confirm(
        `${preErrors.length} row(s) have errors and will be skipped:\n\n${preErrors.slice(0, 8).join('\n')}${preErrors.length > 8 ? '\n…' : ''}\n\nContinue with ${items.length} payment(s)?`
      )
      if (!ok) return
    }

    let receiptUrl: string | undefined
    if (receiptFile) {
      receiptUrl = await uploadReceipt(receiptFile)
    }

    const paymentDate = new Date().toISOString()
    createPaymentMutation.mutate(
      items.map((row) => ({
        ...row,
        receiptUrl,
        paymentDate,
      }))
    )
  }

  const handleDownloadReceipt = async (payment: any) => {
    const building_payment = payment.unit_id ? await fetchBuildingPaymentByUnitId(payment.unit_id) : null
    await generateReceiptPDF({ ...payment, building_payment })
  }

  const closeModal = () => {
    setIsModalOpen(false)
    resetForm()
  }

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      {showSuccessAlert && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-green-900">Payment Recorded Successfully</p>
            <p className="text-sm text-green-700 mt-1">{successMessage}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Payments
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Track and record payment transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input"
            title="Filter payments by month"
          />
          <button onClick={openRecordModal} className="btn btn-primary">
            <Plus size={20} />
            Record Payment
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto w-full">
        <div className="p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-600 whitespace-nowrap">Building</label>
            <select
              value={selectedBuildingId}
              onChange={(e) => setSelectedBuildingId(e.target.value)}
              className="input min-w-[200px]"
              title="Filter payments and record-payment list by building"
            >
              <option value="">All buildings</option>
              {buildingsList.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          {selectedBuildingId && selectedBuildingRow && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="font-semibold text-slate-900">Payment details for this building</span>
                <Link to="/buildings" className="text-primary-600 hover:underline text-xs font-medium shrink-0">
                  Edit in Buildings
                </Link>
              </div>
              {!buildingHasPaymentOverride(selectedBuildingRow) ? (
                <p className="text-xs text-slate-500">
                  No building-specific instructions saved. Showing your global Payment Info from Billing (set under
                  Billing → Payment Info).
                </p>
              ) : null}
              {(() => {
                const resolved = resolvePaymentInstructions(selectedBuildingRow, readGlobalPaymentSettings())
                if (!resolved.method && !resolved.paybill && !resolved.account && !resolved.notes) {
                  return <p className="text-slate-500 text-xs">Nothing configured yet.</p>
                }
                return (
                  <ul className="space-y-1 text-slate-800">
                    {resolved.method ? <li>Method: {resolved.method}</li> : null}
                    {resolved.paybill ? <li>Paybill: {resolved.paybill}</li> : null}
                    {resolved.account ? <li>Account: {resolved.account}</li> : null}
                    {resolved.notes ? <li className="whitespace-pre-wrap">Notes: {resolved.notes}</li> : null}
                  </ul>
                )
              })()}
            </div>
          )}
          {!selectedBuildingId && (
            <p className="text-xs text-slate-500">
              Select a building to show its paybill/account instructions here. Global defaults come from{' '}
              <Link to="/billing" className="text-primary-600 hover:underline">
                Billing
              </Link>{' '}
              → Payment Info.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value as 'unit' | 'tenant')
                  setSelectedEntityId('')
                }}
                className="input"
              >
                <option value="unit">Unit</option>
                <option value="tenant">Tenant</option>
              </select>
              <select
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                className="input w-64"
              >
                <option value="">All {filterType === 'unit' ? 'units' : 'tenants'}</option>
                {filterType === 'unit'
                  ? filteredUnitsForSelect.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_number} {u.building ? `(${u.building})` : ''}
                      </option>
                    ))
                  : filteredTenantsForSelect.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search payments..."
                className="input w-64"
              />
            </div>
          </div>
        </div>
        {selectedEntityId && paymentsByEntity && (
          <div className="p-3 grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-sm text-slate-600">Total Paid</div>
              <div className="font-bold text-slate-900">{formatCurrency(paymentsSummary.total || 0)}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-sm text-slate-600">Payments</div>
              <div className="font-bold text-slate-900">{paymentsSummary.count || 0}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-sm text-slate-600">Last Payment</div>
              <div className="font-bold text-slate-900">{paymentsSummary.last ? formatDate(paymentsSummary.last) : 'N/A'}</div>
            </div>
          </div>
        )}
        {!selectedEntityId && selectedBuildingId && buildingPaymentsSummary !== null && (
          <div className="p-3 grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-sm text-slate-600">Building total (this month)</div>
              <div className="font-bold text-slate-900">{formatCurrency(buildingPaymentsSummary.total || 0)}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-sm text-slate-600">Payments</div>
              <div className="font-bold text-slate-900">{buildingPaymentsSummary.count || 0}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <div className="text-sm text-slate-600">Last payment</div>
              <div className="font-bold text-slate-900">
                {buildingPaymentsSummary.last ? formatDate(buildingPaymentsSummary.last) : 'N/A'}
              </div>
            </div>
          </div>
        )}
        <table className="table w-full text-xs sm:text-sm">
          <thead>
            <tr>
              <th className="w-[90px] sm:w-[110px]">Date</th>
              <th className="w-[100px] sm:w-[120px]">Tenant</th>
              <th className="w-[70px] sm:w-[90px]">Unit</th>
              <th className="w-[100px] sm:w-[120px]">Billing Month</th>
              <th className="w-[80px] sm:w-[100px]">Amount</th>
              <th className="w-[70px] sm:w-[90px]">Method</th>
              <th className="w-[60px] sm:w-[80px]">Receipt</th>
              <th className="w-[90px] sm:w-[100px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paymentsError && (
              <tr>
                <td colSpan={8} className="p-4 text-center">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm font-semibold text-red-900 mb-1">Error loading payments</p>
                    <p className="text-sm text-red-700">
                      {paymentsError.message || 'Failed to load payments. Please check your Supabase configuration.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {paymentsLoading ? (
              <tr>
                <td colSpan={8} className="p-4 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-2 text-slate-600">Loading payments...</p>
                </td>
              </tr>
            ) : filteredPayments && filteredPayments.length > 0 ? (
              filteredPayments.map((payment: any) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.payment_date)}</td>
                  <td>{payment.tenants?.name || 'N/A'}</td>
                  <td>
                    {payment.units?.unit_number} ({payment.units?.buildings?.name})
                  </td>
                  <td>{payment.bills?.billing_month || 'N/A'}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(payment.amount)}</td>
                  <td>
                    <span className="badge badge-info capitalize">{payment.payment_method}</span>
                  </td>
                  <td>
                    {payment.receipt_url ? (
                      <a href={payment.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400">No receipt</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDownloadReceipt(payment)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                      title="Download Receipt"
                    >
                      <Download size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-8 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="text-slate-400" size={24} />
                  </div>
                  <p className="text-slate-500 font-medium">No payments found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto w-full">
        <div className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Advance Credits</h2>
            <p className="text-sm text-slate-500">Track advance payment credits for tenants and see when they are applied to future bills.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <input
              type="search"
              value={advanceSearch}
              onChange={(e) => setAdvanceSearch(e.target.value)}
              placeholder="Search advance credits..."
              className="input w-full sm:w-64"
            />
            <select
              value={advanceStatusFilter}
              onChange={(e) => setAdvanceStatusFilter(e.target.value as 'all' | 'pending' | 'applied')}
              className="input w-full sm:w-48"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="applied">Applied</option>
            </select>
          </div>
        </div>
        <div className="p-3 grid grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="text-sm text-slate-600">Advance credits</div>
            <div className="font-bold text-slate-900">{advancePaymentsSummary.count}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="text-sm text-slate-600">Total amount</div>
            <div className="font-bold text-slate-900">{formatCurrency(advancePaymentsSummary.total)}</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <div className="text-sm text-slate-600">Pending / Applied</div>
            <div className="font-bold text-slate-900">
              {advancePaymentsSummary.pending} / {advancePaymentsSummary.applied}
            </div>
          </div>
        </div>
        <table className="table w-full text-xs sm:text-sm">
          <thead>
            <tr>
              <th className="w-[90px] sm:w-[110px]">Date</th>
              <th className="w-[120px] sm:w-[140px]">Tenant</th>
              <th className="w-[70px] sm:w-[90px]">Unit</th>
              <th className="w-[120px] sm:w-[140px]">Building</th>
              <th className="w-[90px] sm:w-[110px]">Amount</th>
              <th className="w-[110px] sm:w-[140px]">Target month</th>
              <th className="w-[80px] sm:w-[100px]">Status</th>
              <th className="w-[100px] sm:w-[120px]">Applied bill</th>
            </tr>
          </thead>
          <tbody>
            {advancePaymentsError && (
              <tr>
                <td colSpan={8} className="p-4 text-center">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm font-semibold text-red-900 mb-1">Error loading advance credits</p>
                    <p className="text-sm text-red-700">
                      {advancePaymentsError.message || 'Failed to load advance payment credits.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
            {advancePaymentsLoading ? (
              <tr>
                <td colSpan={8} className="p-4 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-2 text-slate-600">Loading advance credits...</p>
                </td>
              </tr>
            ) : filteredAdvancePayments && filteredAdvancePayments.length > 0 ? (
              filteredAdvancePayments.map((payment: any) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.payment_date)}</td>
                  <td>{payment.tenant_name}</td>
                  <td>{payment.unit_number}</td>
                  <td>{payment.building_name || 'N/A'}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(payment.amount)}</td>
                  <td>{new Date(payment.target_month).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })}</td>
                  <td>
                    <span className={`badge ${payment.applied_at ? 'badge-success' : 'badge-warning'} capitalize`}>
                      {payment.applied_at ? 'Applied' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    {payment.applied_bill ? (
                      <span className="text-slate-700 text-sm">{billingMonthKey(payment.applied_bill.billing_month)}</span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="p-8 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <DollarSign className="text-slate-400" size={24} />
                  </div>
                  <p className="text-slate-500 font-medium">No advance payment credits found.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Record Payment</h2>

              <div className="flex rounded-lg border border-slate-200 p-1 mb-4 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setPaymentMode('current')}
                  className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors ${
                    paymentMode === 'current' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Pay selected bill(s)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('advance')}
                  className={`flex-1 py-2 px-3 text-sm font-semibold rounded-md transition-colors ${
                    paymentMode === 'advance' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Advance (future month)
                </button>
              </div>

              {paymentMode === 'advance' && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Credit to billing month</label>
                  <input
                    type="month"
                    value={advanceTargetMonth}
                    onChange={(e) => setAdvanceTargetMonth(e.target.value)}
                    className="input"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Must be after each selected bill&apos;s month. If no bill exists for that month yet, a{' '}
                    <strong>rent-only</strong> bill is created from the unit&apos;s monthly rent (utilities added when
                    you run Generate Bills). Existing payments stay on the bill.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {paymentMode === 'advance' ? 'All tenants' : `Pending bills (${selectedMonth}`}
                    {paymentMode !== 'advance' && selectedBuildingId
                      ? ` · ${buildingsList.find((x: any) => x.id === selectedBuildingId)?.name ?? 'this building'}`
                      : ''}
                    {paymentMode !== 'advance' ? ')' : ''}
                  </label>
                  <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {pendingBillsError && paymentMode !== 'advance' && <div className="p-3 text-sm text-red-600">Error loading bills</div>}
                    {pendingBillsLoading && paymentMode !== 'advance' && !pendingBillsError && (
                      <div className="p-3 text-sm text-slate-500">Loading bills...</div>
                    )}
                    {paymentMode !== 'advance' && !pendingBillsLoading && !pendingBillsError && (!pendingBills || pendingBills.length === 0) && (
                      <div className="p-3 text-sm text-slate-500">No pending bills for this month.</div>
                    )}
                    {paymentMode !== 'advance' && !pendingBillsLoading && !pendingBillsError && pendingBills && pendingBills.length > 0 && pendingBillsForBuilding.length === 0 && (
                      <div className="p-3 text-sm text-slate-500">
                        No pending bills for the selected building this month. Choose another building or clear the
                        building filter.
                      </div>
                    )}
                    {paymentMode === 'advance' && advanceTenantRows.length === 0 && (
                      <div className="p-3 text-sm text-slate-500">No tenants found for the selected building.</div>
                    )}
                    {paymentMode === 'advance'
                      ? advanceTenantRows.map((tenantRow: any) => {
                          const checked = selectedBillIds.includes(tenantRow.id)
                          const disabled = !tenantRow.unit_id
                          return (
                            <label
                              key={tenantRow.id}
                              className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 ${checked ? 'bg-slate-50/80' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={() => toggleBillSelection(tenantRow.id, tenantRow)}
                                className="mt-1 rounded border-slate-300"
                              />
                              <div className="flex-1 min-w-0 text-sm">
                                <div className="font-medium text-slate-900">
                                  {tenantRow.name} — {tenantRow.unit_number ?? 'No unit'}
                                </div>
                                <div className="text-slate-600 text-xs mt-0.5">
                                  {tenantRow.building ? `${tenantRow.building}` : 'Unassigned unit'} ·{' '}
                                  {tenantRow.monthly_rent != null ? formatCurrency(tenantRow.monthly_rent) : 'No rent data'}
                                  {paymentMode === 'advance' && advanceTargetMonth && (
                                    <span className="text-emerald-800"> · credit for {advanceTargetMonth}</span>
                                  )}
                                </div>
                                {checked && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs text-slate-500 whitespace-nowrap">Amount (KES)</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={rowAmounts[tenantRow.id] ?? ''}
                                      onChange={(e) => updateRowAmount(tenantRow.id, e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="input flex-1 min-w-0 py-1.5 text-sm"
                                      placeholder="0.00"
                                    />
                                  </div>
                                )}
                              </div>
                            </label>
                          )
                        })
                      : pendingBillsForBuilding?.map((bill: any) => {
                          const checked = selectedBillIds.includes(bill.id)
                          return (
                            <label
                              key={bill.id}
                              className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50 ${checked ? 'bg-slate-50/80' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleBillSelection(bill.id, bill)}
                                className="mt-1 rounded border-slate-300"
                              />
                              <div className="flex-1 min-w-0 text-sm">
                                <div className="font-medium text-slate-900">
                                  {bill.units?.unit_number} — {bill.tenants?.name}
                                </div>
                                <div className="text-slate-600 text-xs mt-0.5">
                                  This bill {formatCurrency(bill.balance)} due · Month {billingMonthKey(bill.billing_month)}
                                </div>
                                {checked && (
                                  <div className="mt-2 flex items-center gap-2">
                                    <span className="text-xs text-slate-500 whitespace-nowrap">Amount (KES)</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={rowAmounts[bill.id] ?? ''}
                                      onChange={(e) => updateRowAmount(bill.id, e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="input flex-1 min-w-0 py-1.5 text-sm"
                                      placeholder="0.00"
                                    />
                                  </div>
                                )}
                              </div>
                            </label>
                          )
                        })}
                  </div>
                  <div className="flex flex-wrap items-end gap-2 mt-2">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fill all selected</label>
                      <input
                        type="number"
                        step="0.01"
                        value={fillAllValue}
                        onChange={(e) => setFillAllValue(e.target.value)}
                        className="input py-1.5 text-sm"
                        placeholder="Amount"
                      />
                    </div>
                    <button type="button" onClick={applyFillAllToSelected} className="btn btn-secondary text-sm py-1.5">
                      Apply to selected
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'mpesa' | 'bank')}
                    className="input"
                  >
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Upload Receipt (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    className="input"
                  />
                  <p className="text-xs text-slate-500 mt-1">One file is attached to every payment in this batch.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input"
                    rows={3}
                    placeholder="Additional notes..."
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={closeModal} className="flex-1 btn btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 btn btn-primary" disabled={createPaymentMutation.isPending}>
                    {createPaymentMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Processing...
                      </>
                    ) : (
                      'Record payment(s)'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
