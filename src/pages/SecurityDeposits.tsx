import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, SecurityDeposit } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Shield, AlertCircle, X, FileText, Loader } from 'lucide-react'

export default function SecurityDeposits() {
  const [selectedDeposit, setSelectedDeposit] = useState<SecurityDeposit | null>(null)
  const [showLeaseEndModal, setShowLeaseEndModal] = useState(false)
  const [damagesAmount, setDamagesAmount] = useState('')
  const [damagesDescription, setDamagesDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [leaseEndTenantBills, setLeaseEndTenantBills] = useState<any[]>([])
  const [loadingBills, setLoadingBills] = useState(false)
  const queryClient = useQueryClient()

  const { data: deposits, error: depositsError, isLoading: depositsLoading } = useQuery({
    queryKey: ['security-deposits'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      const { data, error } = await supabase
        .from('security_deposits')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error

      // Fetch related data and normalize unit/building shape
      const depositsWithRelations = await Promise.all(
        (data || []).map(async (deposit: any) => {
          const [tenantRes, unitRes] = await Promise.all([
            supabase
              .from('tenants')
              .select('name, phone')
              .eq('id', deposit.tenant_id)
              .single(),
            deposit.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', deposit.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])

          // Resolve building name if available
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
            ...deposit,
            tenants: tenantRes.data,
            units: unitRes.data
              ? { unit_number: unitRes.data.unit_number, buildings: buildingName ? { name: buildingName } : null }
              : null,
          }
        })
      )

      return depositsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: deductions } = useQuery({
    queryKey: ['security-deposit-deductions', selectedDeposit?.id],
    queryFn: async () => {
      if (!selectedDeposit) return []
      
      const { data, error } = await supabase
        .from('security_deposit_deductions')
        .select('*')
        .eq('security_deposit_id', selectedDeposit.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!selectedDeposit,
  })

  const processLeaseEndMutation = useMutation({
    mutationFn: async ({ depositId, damagesAmount, damagesDescription }: { 
      depositId: string
      damagesAmount: number
      damagesDescription: string
    }) => {
      // Get tenant's outstanding balance and arrears
      const { data: depositData } = await supabase
        .from('security_deposits')
        .select('tenant_id, unit_id')
        .eq('id', depositId)
        .single()

      if (!depositData) throw new Error('Deposit not found')

      // Calculate total arrears
      const { data: billsData } = await supabase
        .from('bills')
        .select('balance, total_amount')
        .eq('tenant_id', depositData.tenant_id)
        .gt('balance', 0)

      const totalArrears = (billsData || []).reduce((sum, b) => sum + (b.balance || 0), 0)

      // Record damages deduction if any
      if (damagesAmount > 0) {
        const { error: damagesError } = await supabase
          .from('security_deposit_deductions')
          .insert([{
            security_deposit_id: depositId,
            deduction_type: 'damages',
            amount: damagesAmount,
            description: damagesDescription || 'Damages at lease end'
          }])

        if (damagesError) throw damagesError
      }

      // Record arrears deduction if any
      if (totalArrears > 0) {
        const { error: arrearsError } = await supabase
          .from('security_deposit_deductions')
          .insert([{
            security_deposit_id: depositId,
            deduction_type: 'arrears',
            amount: totalArrears,
            description: 'Outstanding arrears at lease end'
          }])

        if (arrearsError) throw arrearsError
      }

      // Wait a moment for database triggers to update total_deductions
      // Then fetch the updated deposit to get the correct refund_amount
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Fetch the updated deposit with all calculated fields
      const { data: updatedDeposit, error: fetchError } = await supabase
        .from('security_deposits')
        .select('refund_amount, amount, total_deductions')
        .eq('id', depositId)
        .single()

      if (fetchError) throw fetchError

      // Calculate refund amount: amount - total_deductions
      // Use the calculated refund_amount from the database (generated column)
      // or calculate it manually if needed
      const refundAmount = updatedDeposit?.refund_amount ?? 
        ((updatedDeposit?.amount || 0) - (updatedDeposit?.total_deductions || 0))
      
      const status = refundAmount > 0 ? 'refunded' : 'forfeited'
      
      console.log('Processing refund:', {
        depositId,
        amount: updatedDeposit?.amount,
        totalDeductions: updatedDeposit?.total_deductions,
        refundAmount,
        status
      })

      // Explicitly set updated_at to ensure it's updated for the reports query
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('security_deposits')
        .update({ 
          status,
          notes: `Lease ended. ${damagesDescription || ''}`,
          updated_at: now
        })
        .eq('id', depositId)

      if (updateError) throw updateError
      
      console.log('Deposit updated:', { depositId, status, updated_at: now, refundAmount })

      // If refund was processed (status is 'refunded'), archive tenant and mark unit as vacant
      if (status === 'refunded') {
        // Archive the tenant (set status to 'inactive')
        const { error: tenantUpdateError } = await supabase
          .from('tenants')
          .update({ 
            status: 'inactive',
            updated_at: new Date().toISOString()
          })
          .eq('id', depositData.tenant_id)

        if (tenantUpdateError) throw tenantUpdateError

        // Mark unit as vacant and remove tenant assignment
        const { error: unitUpdateError } = await supabase
          .from('units')
          .update({ 
            status: 'vacant',
            tenant_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', depositData.unit_id)

        if (unitUpdateError) throw unitUpdateError
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security-deposits'] })
      await queryClient.invalidateQueries({ queryKey: ['security-deposit-deductions'] })
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['refunds-report'] })
      await queryClient.invalidateQueries({ queryKey: ['financial-summary'] })
      setShowLeaseEndModal(false)
      setSelectedDeposit(null)
      setDamagesAmount('')
      setDamagesDescription('')
      setError(null)
      alert('Lease end processed successfully! Tenant archived and unit marked as vacant.')
    },
    onError: (error: any) => {
      console.error('Failed to process lease end:', error)
      setError(error.message || 'Failed to process lease end')
    },
  })

  const handleProcessLeaseEnd = (deposit: SecurityDeposit) => {
    setSelectedDeposit(deposit)
    setShowLeaseEndModal(true)
    setError(null)
    loadTenantBills(deposit.tenant_id)
  }

  const loadTenantBills = async (tenantId: string) => {
    setLoadingBills(true)
    try {
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('id, billing_month, arrears_brought_forward, water_amount, elec_amount, rent_amount, balance, amount_paid')
        .eq('tenant_id', tenantId)
        .order('billing_month', { ascending: false })

      if (billsError) throw billsError
      setLeaseEndTenantBills(billsData || [])
    } catch (err) {
      console.error('Error loading tenant bills:', err)
      setError('Failed to load tenant billing details')
    } finally {
      setLoadingBills(false)
    }
  }

  const handleSubmitLeaseEnd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeposit) return

    processLeaseEndMutation.mutate({
      depositId: selectedDeposit.id,
      damagesAmount: parseFloat(damagesAmount) || 0,
      damagesDescription: damagesDescription
    })
  }

  const visibleDeposits = (deposits || []).filter((d: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (d.tenants?.name || '').toLowerCase().includes(q) ||
      (d.units?.unit_number || '').toString().toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Security Deposits
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Manage tenant security deposits and refunds</p>
        </div>
      </div>

      {depositsError && (
        <div className="card p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50">
          <p className="text-sm text-red-700 dark:text-red-400">
            Error loading security deposits: {depositsError.message}
          </p>
        </div>
      )}

      {depositsLoading && (
        <div className="card text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading security deposits...</p>
        </div>
      )}

      {!depositsLoading && deposits && deposits.length > 0 && (
        <div>
          <div className="p-3 flex items-center justify-end">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deposits..."
              className="input w-64"
            />
          </div>
          <div className="card overflow-x-auto w-full">
            <table className="table w-full text-xs sm:text-sm">
              <thead>
                <tr>
                  <th className="min-w-[120px]">Tenant</th>
                  <th className="min-w-[100px]">Unit</th>
                  <th className="min-w-[100px]">Amount</th>
                  <th className="min-w-[100px]">Deductions</th>
                  <th className="min-w-[100px]">Refund</th>
                  <th className="min-w-[80px]">Status</th>
                  <th className="min-w-[100px]">Date Deposited</th>
                  <th className="min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleDeposits.map((deposit: any) => (
                  <tr key={deposit.id}>
                    <td className="text-slate-700 dark:text-slate-300">
                      <div className="flex flex-col">
                        <span className="font-semibold">{deposit.tenants?.name || 'N/A'}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {deposit.tenants?.phone || ''}
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-600 dark:text-slate-400">
                      {deposit.units?.unit_number} ({deposit.units?.buildings?.name})
                    </td>
                    <td className="font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(deposit.amount)}
                    </td>
                    <td className="font-medium text-red-600 dark:text-red-400">
                      {formatCurrency(deposit.total_deductions || 0)}
                    </td>
                    <td className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(deposit.refund_amount || 0)}
                    </td>
                    <td>
                      <span
                        className={`badge text-[10px] px-1.5 py-0.5 ${
                          deposit.status === 'active'
                            ? 'badge-success'
                            : deposit.status === 'refunded'
                            ? 'badge-info'
                            : deposit.status === 'processing'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        {deposit.status}
                      </span>
                    </td>
                    <td className="text-slate-600 dark:text-slate-400">
                      {formatDate(deposit.date_deposited)}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {deposit.status === 'active' && (
                          <button
                            onClick={() => handleProcessLeaseEnd(deposit)}
                            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                            title="Process Lease End"
                          >
                            <FileText size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedDeposit(deposit)}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                          title="View Details"
                        >
                          <Shield size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!depositsLoading && (!deposits || deposits.length === 0) && (
        <div className="card text-center py-16">
          <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="text-slate-400" size={40} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No security deposits yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Security deposits will appear here when tenants are created</p>
        </div>
      )}

      {/* Lease End Modal */}
      {showLeaseEndModal && selectedDeposit && (
        <div className="modal-overlay" onClick={() => {
          setShowLeaseEndModal(false)
          setSelectedDeposit(null)
          setError(null)
          setLeaseEndTenantBills([])
          setDamagesAmount('')
          setDamagesDescription('')
        }}>
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                    Process Lease End
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-zinc-400">
                    Final settlement for {selectedDeposit.tenants?.name || 'tenant'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowLeaseEndModal(false)
                    setSelectedDeposit(null)
                    setError(null)
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-300 mb-1">Error</p>
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              {/* Current Deposit Status */}
              <div className="mb-6 p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Deposit Status</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600 dark:text-zinc-400">Deposit Amount:</span>
                    <span className="font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(selectedDeposit.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600 dark:text-zinc-400">Current Deductions:</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(selectedDeposit.total_deductions || 0)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-zinc-700 pt-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Available Refund:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedDeposit.refund_amount || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Arrears & Bills Breakdown */}
              <div className="mb-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Outstanding Arrears & Balances</h3>
                {loadingBills ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="animate-spin text-primary-600 mr-2" size={20} />
                    <span className="text-slate-600 dark:text-slate-400">Loading billing details...</span>
                  </div>
                ) : leaseEndTenantBills.length > 0 ? (
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl p-4">
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {leaseEndTenantBills.map((bill: any) => (
                        <div key={bill.id} className="bg-white dark:bg-zinc-800 p-3 rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100">{bill.billing_month}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Rent: {formatCurrency(bill.rent_amount)} | Water: {formatCurrency(bill.water_amount)} | Electricity: {formatCurrency(bill.elec_amount)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">Balance: {formatCurrency(bill.balance)}</p>
                              {bill.arrears_brought_forward > 0 && (
                                <p className="text-xs text-orange-600 dark:text-orange-400">Arrears: {formatCurrency(bill.arrears_brought_forward)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800/50">
                      {(() => {
                        const totalBalance = leaseEndTenantBills.reduce((sum: number, bill: any) => sum + (bill.balance || 0), 0)
                        const totalArrears = leaseEndTenantBills.reduce((sum: number, bill: any) => sum + (bill.arrears_brought_forward || 0), 0)
                        return (
                          <>
                            <div className="flex justify-between mb-2">
                              <span className="font-semibold text-orange-900 dark:text-orange-300">Total Outstanding Balance:</span>
                              <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(totalBalance)}</span>
                            </div>
                            {totalArrears > 0 && (
                              <div className="flex justify-between">
                                <span className="font-semibold text-orange-900 dark:text-orange-300">Total Arrears Brought Forward:</span>
                                <span className="font-bold text-orange-600 dark:text-orange-400">{formatCurrency(totalArrears)}</span>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-xl p-4">
                    <p className="text-sm text-green-700 dark:text-green-300">✓ No outstanding arrears or balances</p>
                  </div>
                )}
              </div>

              {/* Settlement Calculation */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Settlement Calculation</h3>
                {(() => {
                  const totalBalance = leaseEndTenantBills.reduce((sum: number, bill: any) => sum + (bill.balance || 0), 0)
                  const depositAmount = selectedDeposit.amount || 0
                  const existingDeductions = selectedDeposit.total_deductions || 0
                  const newDamagesAmount = parseFloat(damagesAmount) || 0
                  // Only deduct positive balance (money owed), not negative balance (overpayment)
                  const arrearsTodeduct = Math.max(0, totalBalance)
                  const totalDeductions = existingDeductions + arrearsTodeduct + newDamagesAmount
                  const refundAmount = Math.max(0, depositAmount - totalDeductions)
                  
                  return (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Deposit Amount:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(depositAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Existing Deductions:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(existingDeductions)}</span>
                      </div>
                      <div className={`p-2 rounded ${totalBalance < 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : ''}`}>
                        <div className="flex justify-between">
                          <span className={`text-slate-600 dark:text-slate-400 ${totalBalance < 0 ? 'text-green-700 dark:text-green-300 font-semibold' : ''}`}>
                            {totalBalance < 0 ? 'Tenant Overpayment (Credit):' : 'Tenant Arrears/Balance:'}
                          </span>
                          <span className={`font-semibold ${totalBalance < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {formatCurrency(totalBalance)}
                          </span>
                        </div>
                        {totalBalance < 0 && (
                          <p className="text-xs text-green-700 dark:text-green-400 mt-1">Tenant paid more than what was due</p>
                        )}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Damages (to be added):</span>
                        <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(newDamagesAmount)}</span>
                      </div>
                      <div className="border-t border-blue-200 dark:border-blue-800/50 pt-2 my-2"></div>
                      <div className="flex justify-between bg-white dark:bg-blue-900/40 p-2 rounded">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">Total Amount Deducted:</span>
                        <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(totalDeductions)}</span>
                      </div>
                      <div className="flex justify-between bg-white dark:bg-blue-900/40 p-2 rounded">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">Amount to Refund:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(refundAmount)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <form onSubmit={handleSubmitLeaseEnd} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Additional Damages Amount (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={damagesAmount}
                    onChange={(e) => setDamagesAmount(e.target.value)}
                    className="input"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Enter any damages or additional deductions beyond arrears
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Damages Description
                  </label>
                  <textarea
                    value={damagesDescription}
                    onChange={(e) => setDamagesDescription(e.target.value)}
                    className="input"
                    rows={3}
                    placeholder="Describe any damages or additional charges..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLeaseEndModal(false)
                      setSelectedDeposit(null)
                      setError(null)
                      setLeaseEndTenantBills([])
                      setDamagesAmount('')
                      setDamagesDescription('')
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={processLeaseEndMutation.isPending}
                  >
                    {processLeaseEndMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      'Process Lease End'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Deductions Detail Modal */}
      {selectedDeposit && !showLeaseEndModal && (
        <div className="modal-overlay" onClick={() => setSelectedDeposit(null)}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                Security Deposit Details
              </h2>
              <p className="text-sm text-slate-600 dark:text-zinc-400 mb-6">
                {selectedDeposit.tenants?.name || 'Tenant'} - {selectedDeposit.units?.unit_number}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl">
                  <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Deposit Amount</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(selectedDeposit.amount)}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl">
                  <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Refund Amount</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedDeposit.refund_amount || 0)}</p>
                </div>
              </div>

              {deductions && deductions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-700 dark:text-zinc-300 mb-3">Deductions</h3>
                  <div className="space-y-2">
                    {deductions.map((deduction: any) => (
                      <div key={deduction.id} className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-zinc-100 capitalize">{deduction.deduction_type}</p>
                          {deduction.description && (
                            <p className="text-xs text-slate-600 dark:text-zinc-400">{deduction.description}</p>
                          )}
                          <p className="text-xs text-slate-500 dark:text-zinc-500">{formatDate(deduction.created_at)}</p>
                        </div>
                        <p className="font-bold text-red-600 dark:text-red-400">{formatCurrency(deduction.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800 mt-6">
                <button
                  onClick={() => setSelectedDeposit(null)}
                  className="flex-1 btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

