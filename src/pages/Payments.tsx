import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Payment } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Download, DollarSign, CheckCircle } from 'lucide-react'
import { generateReceiptPDF } from '@/lib/pdf'

export default function Payments() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSuccessAlert, setShowSuccessAlert] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')
  const [billId, setBillId] = useState('')
  const [filterType, setFilterType] = useState<'unit' | 'tenant'>('unit')
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [unitsList, setUnitsList] = useState<any[]>([])
  const [tenantsList, setTenantsList] = useState<any[]>([])
  const [amount, setAmount] = useState('')
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

      // Compute month range (start inclusive, nextMonth exclusive)
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

      // Fetch bills first - filter by current month only
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
                  .select('name, phone')
                  .eq('id', bill.tenant_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          // Get building name
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
            tenants: tenantRes.data ? { name: tenantRes.data.name, phone: tenantRes.data.phone } : null
          }
        })
      )
      
      // Sort bills descending by unit number to avoid confusion when selecting
      billsWithRelations.sort((a: any, b: any) => (b.units?.unit_number || '').toString().localeCompare((a.units?.unit_number || '').toString()))

      return billsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  

  const { data: payments, error: paymentsError, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', selectedMonth],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch payments first
      // compute month range (start inclusive, nextMonth exclusive)
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
      
      // Fetch related data separately
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
              : Promise.resolve({ data: null, error: null })
          ])
          
          // Get building name
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
            units: unitRes.data ? {
              unit_number: unitRes.data.unit_number,
              buildings: buildingName ? { name: buildingName } : null
            } : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null
          }
        })
      )
      
      return paymentsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  // Fetch units and tenants lists for filtering
  useQuery({
    queryKey: ['units-list'],
    queryFn: async () => {
      const { data: unitsData, error } = await supabase
        .from('units')
        .select('id,unit_number,building_id')
        .order('unit_number', { ascending: false })
      if (error) throw error

      const unitsWithBuildings = await Promise.all((unitsData || []).map(async (u: any) => {
        let buildingName = null
        if (u.building_id) {
          const { data: b } = await supabase.from('buildings').select('name').eq('id', u.building_id).single()
          buildingName = b?.name || null
        }
        return { id: u.id, unit_number: u.unit_number, building: buildingName }
      }))

      setUnitsList(unitsWithBuildings)
      return unitsWithBuildings
    },
    staleTime: 1000 * 60 * 5,
  })

  useQuery({
    queryKey: ['tenants-list'],
    queryFn: async () => {
      const { data: tenantsData, error } = await supabase
        .from('tenants')
        .select('id,name')
        .order('name')
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

      // Attach related data (bill month, unit number, building, tenant name)
      const withRelations = await Promise.all((paymentsData || []).map(async (p: any) => {
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
          units: unitRes.data ? { unit_number: unitRes.data.unit_number, buildings: buildingName ? { name: buildingName } : null } : null,
          tenants: tenantRes.data ? { name: tenantRes.data.name } : null,
        }
      }))

      return withRelations
    },
  })

  const paymentsSummary = (paymentsByEntity || []).reduce((acc: any, p: any) => {
    acc.total = (acc.total || 0) + (p.amount || 0)
    acc.count = (acc.count || 0) + 1
    acc.last = acc.last || p.payment_date
    return acc
  }, { total: 0, count: 0, last: null })

  const filteredPayments = (payments || []).filter((p: any) => {
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
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(fileName, file)

    if (error) throw error
    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(data.path)
    return publicUrl
  }

  const createPaymentMutation = useMutation({
    mutationFn: async (paymentData: Partial<Payment> & { receipt_url?: string }) => {
      const bill = pendingBills?.find((b: any) => b.id === billId)
      if (!bill) throw new Error('Bill not found')

      // Create payment
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData])
        .select()
        .single()

      if (paymentError) throw paymentError

      // Update bill - only update amount_paid, balance is generated automatically
      const newAmountPaid = (bill.amount_paid || 0) + paymentData.amount!
      // Balance will be recalculated automatically: total_amount - newAmountPaid
      const { error: billError } = await supabase
        .from('bills')
        .update({
          amount_paid: newAmountPaid,
        })
        .eq('id', billId)

      if (billError) throw billError

      // Re-read latest bill values from DB to avoid stale/calc differences
      const { data: freshBill, error: freshError } = await supabase
        .from('bills')
        .select('total_amount, amount_paid, balance, status')
        .eq('id', billId)
        .single()

      if (freshError) {
        console.warn('Failed to fetch fresh bill after payment:', freshError)
      } else {
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
      }

      return payment
    },
    onSuccess: async (payment) => {
      // Invalidate all queries that depend on payments or bills
      await queryClient.invalidateQueries({ queryKey: ['payments'] })
      await queryClient.invalidateQueries({ queryKey: ['pending-bills'] })
      await queryClient.invalidateQueries({ queryKey: ['bills'] })
      await queryClient.invalidateQueries({ queryKey: ['arrears-report'] })
      await queryClient.invalidateQueries({ queryKey: ['revenue-report'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      
      // Wait for critical queries to refetch before closing modal
      // This ensures the bill list is updated with fresh data
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['pending-bills'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['bills'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['payments'], type: 'active' })
      ])
      
      // Show success message
      const bill = pendingBills?.find((b: any) => b.id === billId)
      if (bill && payment) {
        setSuccessMessage(`Payment of ${formatCurrency(payment.amount)} recorded successfully for ${bill.tenants?.name}`)
        setShowSuccessAlert(true)
        
        // Auto-hide success message after 4 seconds
        setTimeout(() => setShowSuccessAlert(false), 4000)
      }
      
      // After refetch completes, close modal and reset form
      setIsModalOpen(false)
      resetForm()
      
      // Clear selected bill to prevent showing stale data
      setBillId('')
    },
    onError: (error: any) => {
      console.error('Failed to create payment:', error)
      alert(error.message || 'Failed to record payment. Please check your Supabase configuration.')
    },
  })

  const resetForm = () => {
    setBillId('')
    setAmount('')
    setPaymentMethod('cash')
    setReceiptFile(null)
    setNotes('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    let receiptUrl: string | undefined
    if (receiptFile) {
      receiptUrl = await uploadReceipt(receiptFile)
    }

    const bill = pendingBills?.find((b: any) => b.id === billId)
    if (!bill) return

    const paymentData = {
      bill_id: billId,
      unit_id: bill.unit_id,
      tenant_id: bill.tenant_id || '',
      amount: parseFloat(amount),
      payment_method: paymentMethod,
      receipt_url: receiptUrl,
      payment_date: new Date().toISOString(),
      notes: notes || undefined,
    }

    createPaymentMutation.mutate(paymentData)
  }

  const handleDownloadReceipt = async (payment: any) => {
    await generateReceiptPDF(payment)
  }

  const selectedBill = pendingBills?.find((b: any) => b.id === billId)

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      {/* Success Alert */}
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
          <button
            onClick={() => {
              // Force refetch of fresh bill data before opening modal
              queryClient.refetchQueries({ queryKey: ['pending-bills'] })
              setIsModalOpen(true)
              resetForm()
            }}
            className="btn btn-primary"
          >
            <Plus size={20} />
            Record Payment
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto w-full">
        <div className="p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <select value={filterType} onChange={(e) => { setFilterType(e.target.value as any); setSelectedEntityId('') }} className="input">
              <option value="unit">Unit</option>
              <option value="tenant">Tenant</option>
            </select>
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="input w-64"
            >
              <option value="">Select {filterType}</option>
              {filterType === 'unit' ? (
                unitsList.map((u) => (
                  <option key={u.id} value={u.id}>{u.unit_number} {u.building ? `(${u.building})` : ''}</option>
                ))
              ) : (
                tenantsList.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))
              )}
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
                <td colSpan={7} className="p-4 text-center">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm font-semibold text-red-900 mb-1">Error loading payments</p>
                    <p className="text-sm text-red-700">{paymentsError.message || 'Failed to load payments. Please check your Supabase configuration.'}</p>
                  </div>
                </td>
              </tr>
            )}

            {paymentsLoading ? (
              <tr>
                <td colSpan={7} className="p-4 text-center">
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
                <td className="font-semibold text-green-600">
                  {formatCurrency(payment.amount)}
                </td>
                <td>
                  <span className="badge badge-info capitalize">
                    {payment.payment_method}
                  </span>
                </td>
                <td>
                  {payment.receipt_url ? (
                    <a
                      href={payment.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:underline"
                    >
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
                <td colSpan={7} className="p-8 text-center">
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

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          resetForm()
        }}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Record Payment</h2>
              <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Select Bill
                </label>
                <select
                  value={billId}
                  onChange={(e) => setBillId(e.target.value)}
                  required
                  className="input"
                >
                  <option value="">Select a bill</option>
                  {pendingBillsError && (
                    <option disabled>Error loading bills</option>
                  )}
                  {pendingBillsLoading && !pendingBillsError && (
                    <option disabled>Loading bills...</option>
                  )}
                  {!pendingBillsLoading && !pendingBillsError && pendingBills && pendingBills.length > 0 ? (
                    pendingBills.map((bill: any) => (
                      <option key={bill.id} value={bill.id}>
                        {bill.units?.unit_number} - {bill.tenants?.name} - Balance:{' '}
                        {formatCurrency(bill.balance)}
                      </option>
                    ))
                  ) : !pendingBillsLoading && !pendingBillsError ? (
                    <option disabled>No pending bills</option>
                  ) : null}
                </select>
                {selectedBill && (
                  <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium">Billing Month:</span>
                      <span className="font-bold text-slate-900">{selectedBill.billing_month || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 font-medium">Total Bill:</span>
                      <span className="font-bold text-slate-900">{formatCurrency(selectedBill.total_amount)}</span>
                    </div>
                    {selectedBill.arrears_brought_forward > 0 && (
                      <div className="flex justify-between items-center text-orange-600">
                        <span className="font-medium">Arrears:</span>
                        <span className="font-bold">{formatCurrency(selectedBill.arrears_brought_forward)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-300">
                      <span className="text-slate-700 font-semibold">Paid:</span>
                      <span className="font-bold text-slate-900">{formatCurrency(selectedBill.amount_paid || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-700 font-semibold">Outstanding:</span>
                      <span className="font-bold text-red-600">
                        {formatCurrency(selectedBill.balance)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Amount (KES)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="input"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as 'cash' | 'mpesa' | 'bank')
                  }
                  className="input"
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Upload Receipt (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    resetForm()
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn btn-primary"
                  disabled={createPaymentMutation.isPending}
                >
                  {createPaymentMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    'Record Payment'
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

