import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import { ArrowLeft, User, Phone, Mail, Home, Receipt, CreditCard, Calendar, AlertCircle, X } from 'lucide-react'
import useToast from '@/hooks/useToast'

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)
  const [moveBuildingId, setMoveBuildingId] = useState('')
  const [moveToUnitId, setMoveToUnitId] = useState('')
  const [moveDate, setMoveDate] = useState('')
  const [moveWaterReading, setMoveWaterReading] = useState('')
  const [moveElecReading, setMoveElecReading] = useState('')
  const [moveProrate, setMoveProrate] = useState(true)
  const [moveError, setMoveError] = useState<string | null>(null)

  const {
    data: tenant,
    isLoading: tenantLoading,
    error: tenantError,
  } = useQuery({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*, units!fk_tenants_unit(unit_number, buildings!units_building_id_fkey(name), monthly_rent)')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    },
    enabled: !!id,
    retry: 1,
  })

  const { data: buildings } = useQuery({
    queryKey: ['buildings-for-move-tenant'],
    queryFn: async () => {
      const { data, error } = await supabase.from('buildings').select('id, name').order('name')
      if (error) throw error
      return data || []
    },
    staleTime: 0,
  })

  const { data: vacantUnits, isLoading: vacantUnitsLoading, error: vacantUnitsError } = useQuery({
    queryKey: ['vacant-units-for-move-tenant', moveBuildingId],
    queryFn: async () => {
      let query = supabase
        .from('units')
        .select('id, unit_number, building_id, monthly_rent, status, tenant_id, buildings!units_building_id_fkey(name)')
        .eq('status', 'vacant')
        .order('unit_number', { ascending: true })

      if (moveBuildingId) query = query.eq('building_id', moveBuildingId)

      const { data: units, error: unitsError } = await query
      if (unitsError) throw unitsError
      const unitRows = units || []

      return unitRows.map((unit: any) => ({
        ...unit,
        buildings: Array.isArray(unit.buildings) ? unit.buildings[0] : unit.buildings,
      }))
    },
    enabled: isMoveModalOpen,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })

  const tenantUnit = useMemo(() => {
    if (!tenant) return null
    const unitsRel = (tenant as any).units
    return Array.isArray(unitsRel) ? unitsRel[0] : unitsRel
  }, [tenant])

  const tenantBuilding = useMemo(() => {
    const buildingsRel = tenantUnit?.buildings
    return Array.isArray(buildingsRel) ? buildingsRel[0] : buildingsRel
  }, [tenantUnit])

  const fromUnitId = (tenant?.unit_id as string | undefined) || undefined
  const canMoveTenant = Boolean(fromUnitId && tenant?.status === 'active')
  const derivedMoveMonth = useMemo(() => {
    if (!moveDate) return ''
    if (moveDate.length < 7) return ''
    return `${moveDate.slice(0, 7)}-01`
  }, [moveDate])

  const selectedToUnit = useMemo(() => {
    return (vacantUnits || []).find((u: any) => u.id === moveToUnitId) || null
  }, [vacantUnits, moveToUnitId])

  const prorationPreview = useMemo(() => {
    if (!moveDate) return null
    const fromMonthly = Number(tenantUnit?.monthly_rent || 0) || 0
    const toMonthly = Number(selectedToUnit?.monthly_rent || 0) || 0

    // Interpret moveDate as local date; day-of-month drives the same split rule as SQL:
    // move date is first day in new unit, old unit billed up to day before move date.
    const d = new Date(`${moveDate}T00:00:00`)
    if (Number.isNaN(d.getTime())) return null

    const year = d.getFullYear()
    const monthIndex = d.getMonth() // 0-based
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const moveDay = d.getDate()

    const oldDays = Math.max(0, Math.min(daysInMonth, moveDay - 1))
    const newDays = Math.max(0, daysInMonth - oldDays)

    if (!moveProrate) {
      return {
        daysInMonth,
        oldDays,
        newDays,
        oldRent: fromMonthly,
        newRent: 0,
      }
    }

    const oldRent = Math.round((fromMonthly * (oldDays / daysInMonth)) * 100) / 100
    const newRent = Math.round((toMonthly * (newDays / daysInMonth)) * 100) / 100
    return { daysInMonth, oldDays, newDays, oldRent, newRent }
  }, [moveDate, moveProrate, selectedToUnit?.monthly_rent, tenantUnit?.monthly_rent])

  const { data: bills } = useQuery({
    queryKey: ['tenant-bills', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('tenant_id', id)
        .order('billing_month', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!id,
  })

  const { data: payments } = useQuery({
    queryKey: ['tenant-payments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, bills(billing_month)')
        .eq('tenant_id', id)
        .order('payment_date', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!id,
  })

  const { data: settlements } = useQuery({
    queryKey: ['tenant-settlements', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lease_end_settlements')
        .select('*')
        .eq('tenant_id', id)
        .order('lease_end_date', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!id,
  })

  if (tenantLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (tenantError) {
    return (
      <div className="space-y-4">
        <Link
          to="/tenants"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-600"
        >
          <ArrowLeft size={20} />
          Back to Tenants
        </Link>

        <div className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-600 mt-0.5" size={20} />
            <div>
              <h2 className="font-semibold text-gray-900">Failed to load tenant</h2>
              <p className="text-sm text-gray-600 mt-1">
                {(tenantError as any)?.message || 'An unexpected error occurred.'}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Common causes are missing database tables, RLS/auth issues, or the tenant record no longer existing.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="space-y-4">
        <Link
          to="/tenants"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-600"
        >
          <ArrowLeft size={20} />
          Back to Tenants
        </Link>
        <div className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-orange-600 mt-0.5" size={20} />
            <div>
              <h2 className="font-semibold text-gray-900">Tenant not found</h2>
              <p className="text-sm text-gray-600 mt-1">
                This tenant may have been deleted or you may not have permission to view it.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const totalBalance = bills?.reduce((sum, b) => sum + (b.balance || 0), 0) || 0
  const totalPaid = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0

  return (
    <div className="space-y-6">
      <Link
        to="/tenants"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-600"
      >
        <ArrowLeft size={20} />
        Back to Tenants
      </Link>

      <div className="card">
        <div className="flex items-start gap-6">
          {tenant.id_photo_url ? (
            <img
              src={tenant.id_photo_url}
              alt={tenant.name}
              className="w-24 h-24 rounded-lg object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-lg bg-gray-200 flex items-center justify-center">
              <User size={48} className="text-gray-400" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{tenant.name}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Phone className="text-gray-400" size={20} />
                <span>{tenant.phone}</span>
              </div>
              {tenant.email && (
                <div className="flex items-center gap-3">
                  <Mail className="text-gray-400" size={20} />
                  <span>{tenant.email}</span>
                </div>
              )}
              {tenantUnit && (
                <div className="flex items-center gap-3">
                  <Home className="text-gray-400" size={20} />
                  <span>
                    {tenantUnit.unit_number} - {tenantBuilding?.name}
                  </span>
                </div>
              )}
              <div>
                <span
                  className={`badge ${
                    tenant.status === 'active' ? 'badge-success' : 'badge-warning'
                  }`}
                >
                  {tenant.status}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              className="btn btn-secondary"
              disabled={!canMoveTenant}
              onClick={() => {
                setMoveError(null)
                setMoveBuildingId('')
                setMoveToUnitId('')
                setMoveDate(new Date().toISOString().slice(0, 10))
                setMoveWaterReading('')
                setMoveElecReading('')
                setMoveProrate(true)
                queryClient.invalidateQueries({ queryKey: ['vacant-units-for-move-tenant'] })
                setIsMoveModalOpen(true)
              }}
              title={!canMoveTenant ? 'Tenant must be active and assigned to a unit' : 'Move tenant to another unit'}
            >
              Move tenant
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="text-primary-600" size={24} />
            <h3 className="font-semibold">Current Balance</h3>
          </div>
          <p
            className={`text-3xl font-bold ${
              totalBalance > 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(totalBalance)}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Receipt className="text-green-600" size={24} />
            <h3 className="font-semibold">Total Paid</h3>
          </div>
          <p className="text-3xl font-bold text-green-600">
            {formatCurrency(totalPaid)}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Home className="text-blue-600" size={24} />
            <h3 className="font-semibold">Monthly Rent</h3>
          </div>
          <p className="text-3xl font-bold">
            {formatCurrency(tenantUnit?.monthly_rent || 0)}
          </p>
        </div>
      </div>

      {/* Lease Information */}
      {(tenant.lease_start || tenant.lease_end) && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="text-primary-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Lease Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tenant.lease_start && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Lease Start Date</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatDate(tenant.lease_start)}
                </p>
              </div>
            )}
            {tenant.lease_end && (
              <div className={`p-4 rounded-lg border ${
                tenant.status === 'inactive' 
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                  : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              }`}>
                <p className={`text-sm mb-1 ${
                  tenant.status === 'inactive' 
                    ? 'text-red-600 dark:text-red-400' 
                    : 'text-orange-600 dark:text-orange-400'
                }`}>
                  Lease End Date
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatDate(tenant.lease_end)}
                </p>
              </div>
            )}
          </div>
          {tenant.lease_end_notes && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Settlement Notes</p>
              <p className="text-gray-900 dark:text-white">{tenant.lease_end_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Lease End Settlement */}
      {settlements && settlements.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="text-orange-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Lease End Settlement</h2>
          </div>
          {settlements.map((settlement: any) => (
            <div key={settlement.id} className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Settlement Date</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatDate(settlement.lease_end_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-1">Total Arrears</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(settlement.total_arrears)}</p>
                </div>
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-1">Amount Deducted</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(settlement.total_deductible)}</p>
                </div>
                <div>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">Amount Refunded</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(settlement.amount_to_refund)}</p>
                </div>
              </div>
              {settlement.settlement_notes && (
                <div className="mt-3 p-3 bg-white dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Notes</p>
                  <p className="text-gray-900 dark:text-white">{settlement.settlement_notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Billing History</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Billing Month</th>
                <th>Water</th>
                <th>Electricity</th>
                <th>Rent</th>
                <th>Arrears</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bills?.map((bill) => (
                <tr key={bill.id}>
                  <td>{formatMonth(bill.billing_month)}</td>
                  <td>{formatCurrency(bill.water_amount)}</td>
                  <td>{formatCurrency(bill.elec_amount)}</td>
                  <td>{formatCurrency(bill.rent_amount)}</td>
                  <td className="text-orange-600">
                    {formatCurrency(bill.arrears_brought_forward)}
                  </td>
                  <td className="font-semibold">
                    {formatCurrency(bill.total_amount)}
                  </td>
                  <td className="text-green-600">
                    {formatCurrency(bill.amount_paid)}
                  </td>
                  <td
                    className={`font-semibold ${
                      bill.balance > 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {formatCurrency(bill.balance)}
                  </td>
                  <td>
                    <span
                      className={`badge ${
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
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this bill? This action cannot be undone.')) return
                        try {
                          const { error } = await supabase.from('bills').delete().eq('id', bill.id)
                          if (error) throw error
                          await queryClient.invalidateQueries({ queryKey: ['tenant-bills', id] })
                        } catch (err: any) {
                          toast.error(err.message || 'Failed to delete bill')
                        }
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      title="Delete Bill"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Payment History</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Billing Month</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments?.map((payment: any) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.payment_date)}</td>
                  <td className="font-semibold text-green-600">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td>
                    <span className="badge badge-info capitalize">
                      {payment.payment_method}
                    </span>
                  </td>
                  <td>{payment.bills?.billing_month || 'N/A'}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isMoveModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => {
            setIsMoveModalOpen(false)
          }}
        >
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Move tenant</h2>
              <button
                onClick={() => setIsMoveModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
                <p className="font-medium mb-1">Move date meaning</p>
                <p>
                  The move date is the <span className="font-semibold">first day</span> the tenant occupies the new unit.
                  The old unit bill is calculated up to the day before the move date, and the new unit starts from the move date.
                </p>
              </div>

              {moveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {moveError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From unit</label>
                  <div className="input bg-gray-50">
                    {tenantUnit?.unit_number ? (
                      <span>
                        {tenantUnit.unit_number} {tenantBuilding?.name ? `- ${tenantBuilding.name}` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-500">Unknown</span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Move date</label>
                  <input
                    type="date"
                    className="input"
                    value={moveDate}
                    onChange={(e) => setMoveDate(e.target.value)}
                  />
                  {derivedMoveMonth && (
                    <p className="text-xs text-gray-500 mt-1">Move month: {derivedMoveMonth}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target building (optional)</label>
                  <select
                    className="input"
                    value={moveBuildingId}
                    onChange={(e) => {
                      setMoveBuildingId(e.target.value)
                      setMoveToUnitId('')
                    }}
                  >
                    <option value="">All buildings</option>
                    {(buildings || []).map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To unit</label>
                  <select
                    className="input"
                    value={moveToUnitId}
                    onChange={(e) => setMoveToUnitId(e.target.value)}
                    disabled={vacantUnitsLoading || !!vacantUnitsError}
                  >
                    <option value="" disabled>
                      {vacantUnitsLoading
                        ? 'Loading vacant units...'
                        : vacantUnits && vacantUnits.length > 0
                        ? 'Select a vacant unit'
                        : 'No vacant units available'}
                    </option>
                    {(vacantUnits || []).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.unit_number}
                        {u.buildings?.name ? ` - ${u.buildings.name}` : ''}
                      </option>
                    ))}
                  </select>
                  {vacantUnitsError && (
                    <p className="text-sm text-red-600 mt-2">
                      Failed to load vacant units: {(vacantUnitsError as any)?.message || 'Unknown error'}
                    </p>
                  )}
                  {!vacantUnitsLoading && !vacantUnitsError && vacantUnits && vacantUnits.length === 0 && (
                    <p className="text-sm text-slate-500 mt-2">No vacant units available for the selected building.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Water meter reading at move (optional)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input"
                    value={moveWaterReading}
                    onChange={(e) => setMoveWaterReading(e.target.value)}
                    placeholder="e.g. 1234.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Electricity meter reading at move (optional)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="input"
                    value={moveElecReading}
                    onChange={(e) => setMoveElecReading(e.target.value)}
                    placeholder="e.g. 5678.9"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={moveProrate}
                  onChange={(e) => setMoveProrate(e.target.checked)}
                />
                Prorate rent for the move month
              </label>

              {prorationPreview && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm">
                  <p className="font-medium text-gray-900 mb-1">Rent split preview</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-gray-700">
                    <div>
                      <p className="text-xs text-gray-500">Old unit days</p>
                      <p className="font-semibold">
                        {prorationPreview.oldDays} / {prorationPreview.daysInMonth}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Old unit rent (move month)</p>
                      <p className="font-semibold">{formatCurrency(prorationPreview.oldRent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">New unit days</p>
                      <p className="font-semibold">
                        {prorationPreview.newDays} / {prorationPreview.daysInMonth}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">New unit rent (move month)</p>
                      <p className="font-semibold">{formatCurrency(prorationPreview.newRent)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Any remaining balance on the old unit bill for this month will be carried into the new unit bill as arrears.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button className="btn btn-secondary" onClick={() => setIsMoveModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!fromUnitId || !moveToUnitId || !moveDate || !derivedMoveMonth}
                  onClick={async () => {
                    try {
                      setMoveError(null)
                      if (!fromUnitId) throw new Error('Tenant has no current unit to move from.')
                      if (!moveToUnitId) throw new Error('Please select a target unit.')
                      if (!moveDate) throw new Error('Please select a move date.')
                      if (!derivedMoveMonth) throw new Error('Invalid move date.')

                      const water = moveWaterReading.trim() ? Number(moveWaterReading) : null
                      const elec = moveElecReading.trim() ? Number(moveElecReading) : null
                      if (water !== null && !Number.isFinite(water)) throw new Error('Invalid water meter reading.')
                      if (elec !== null && !Number.isFinite(elec)) throw new Error('Invalid electricity meter reading.')

                      const { data, error } = await supabase.rpc('rpc_move_tenant', {
                        p_tenant_id: tenant.id,
                        p_from_unit_id: fromUnitId,
                        p_to_unit_id: moveToUnitId,
                        p_move_date: moveDate,
                        p_move_month: derivedMoveMonth,
                        p_water_move_reading: water,
                        p_elec_move_reading: elec,
                        p_prorate: moveProrate,
                      })

                      if (error) throw error
                      if (!data) throw new Error('Move succeeded but returned no data.')

                      await Promise.all([
                        queryClient.invalidateQueries({ queryKey: ['tenant', id] }),
                        queryClient.invalidateQueries({ queryKey: ['tenant-bills', id] }),
                        queryClient.invalidateQueries({ queryKey: ['tenant-payments', id] }),
                        queryClient.invalidateQueries({ queryKey: ['tenants'] }),
                        queryClient.invalidateQueries({ queryKey: ['units'] }),
                      ])

                      toast.success('Tenant moved successfully')
                      setIsMoveModalOpen(false)
                    } catch (err: any) {
                      const msg = err?.message || 'Failed to move tenant'
                      setMoveError(msg)
                      toast.error(msg)
                    }
                  }}
                >
                  Move
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

