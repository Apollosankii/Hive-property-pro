import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Unit } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, Edit, AlertCircle, X, Home } from 'lucide-react'

export default function Units() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitNumber, setUnitNumber] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [securityDepositAmount, setSecurityDepositAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const { data } = await supabase.from('buildings').select('*').order('name')
      return data || []
    },
  })

  const { data: units, error: unitsError, isLoading: unitsLoading } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      // Check authentication first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch units with related data
      // First get all units
      const { data: unitsData, error: unitsError } = await supabase
        .from('units')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (unitsError) {
        console.error('Units query error:', unitsError)
        throw unitsError
      }
      
      if (!unitsData || unitsData.length === 0) {
        console.log('No units found in database')
        return []
      }
      
      console.log('Units fetched:', unitsData.length, 'units')
      
      // Fetch buildings and tenants separately for each unit
      const unitsWithRelations = await Promise.all(
        unitsData.map(async (unit: any) => {
          const [buildingRes, tenantRes] = await Promise.all([
            unit.building_id 
              ? supabase.from('buildings').select('name').eq('id', unit.building_id).single() 
              : Promise.resolve({ data: null, error: null }),
            unit.tenant_id 
              ? supabase.from('tenants').select('name').eq('id', unit.tenant_id).single() 
              : Promise.resolve({ data: null, error: null })
          ])
          
          return {
            ...unit,
            buildings: buildingRes.data ? { name: buildingRes.data.name } : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null
          }
        })
      )
      
      return unitsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    retry: 2,
  })

  const createMutation = useMutation({
    mutationFn: async (newUnit: Partial<Unit>) => {
      const { data, error } = await supabase
        .from('units')
        .insert([newUnit])
        .select()
        .single()
      
      if (error) {
        console.error('Create unit error:', error)
        throw error
      }
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['buildings'] })
      await queryClient.invalidateQueries({ queryKey: ['occupancy-report'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['occupancy-report'] })
      setIsModalOpen(false)
      resetForm()
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to create unit:', error)
      setError(error.message || 'Failed to create unit. Please check your Supabase configuration.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Unit> & { id: string }) => {
      const { data, error } = await supabase
        .from('units')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
        console.error('Update unit error:', error)
        throw error
      }
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['buildings'] })
      await queryClient.invalidateQueries({ queryKey: ['occupancy-report'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['occupancy-report'] })
      setIsModalOpen(false)
      setEditingUnit(null)
      resetForm()
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to update unit:', error)
      setError(error.message || 'Failed to update unit. Please check your Supabase configuration.')
    },
  })

  const resetForm = () => {
    setUnitNumber('')
    setBuildingId('')
    setMonthlyRent('')
    setSecurityDepositAmount('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('You must be logged in to perform this action. Please refresh the page and log in again.')
      return
    }

    const unitData = {
      building_id: buildingId,
      unit_number: unitNumber,
      monthly_rent: parseFloat(monthlyRent),
      security_deposit_amount: parseFloat(securityDepositAmount) || 0,
      status: editingUnit?.status || 'vacant' as const,
    }

    if (editingUnit) {
      updateMutation.mutate({ id: editingUnit.id, ...unitData })
    } else {
      createMutation.mutate(unitData)
    }
  }

  const handleEdit = (unit: any) => {
    setEditingUnit(unit)
    setUnitNumber(unit.unit_number)
    setBuildingId(unit.building_id)
    setMonthlyRent(unit.monthly_rent.toString())
    setSecurityDepositAmount(unit.security_deposit_amount?.toString() || '')
    setIsModalOpen(true)
  }

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Units
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Manage property units and occupancy</p>
        </div>
        <button
          onClick={() => {
            setIsModalOpen(true)
            setEditingUnit(null)
            resetForm()
          }}
          className="btn btn-primary"
        >
          <Plus size={20} />
          Add Unit
        </button>
      </div>

      {unitsError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900 mb-1">Error loading units</p>
          <p className="text-sm text-red-700">{unitsError.message || 'Failed to load units. Please check your Supabase configuration and ensure you are logged in.'}</p>
        </div>
      )}

      {unitsLoading ? (
        <div className="card text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading units...</p>
        </div>
      ) : units && units.length > 0 ? (
        <div className="card overflow-x-auto w-full">
          <table className="table w-full text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="w-[100px] sm:w-[120px]">Unit Number</th>
                <th className="w-[120px] sm:w-[140px]">Building</th>
                <th className="w-[70px] sm:w-[80px]">Status</th>
                <th className="w-[120px] sm:w-[140px]">Tenant</th>
                <th className="w-[90px] sm:w-[110px]">Monthly Rent</th>
                <th className="w-[90px] sm:w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit: any) => (
                <tr key={unit.id}>
                  <td className="font-semibold text-slate-900 dark:text-slate-100 text-xs">{unit.unit_number}</td>
                  <td className="text-slate-700 dark:text-slate-300 text-xs">
                    <span className="truncate block max-w-[100px] sm:max-w-none" title={unit.buildings?.name || 'N/A'}>
                      {unit.buildings?.name || 'N/A'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge text-[10px] px-1.5 py-0.5 ${
                        unit.status === 'occupied'
                          ? 'badge-success'
                          : 'badge-warning'
                      }`}
                    >
                      {unit.status}
                    </span>
                  </td>
                  <td className="text-slate-600 dark:text-slate-400 text-xs">
                    <span className="truncate block max-w-[100px] sm:max-w-none" title={unit.tenants?.name || 'Vacant'}>
                      {unit.tenants?.name || 'Vacant'}
                    </span>
                  </td>
                  <td className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                    {formatCurrency(unit.monthly_rent)}
                  </td>
                  <td>
                    <button
                      onClick={() => handleEdit(unit)}
                      className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Home className="text-slate-400" size={40} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No units yet</h3>
          <p className="text-slate-600 mb-6">Get started by adding your first unit</p>
          <button
            onClick={() => {
              setIsModalOpen(true)
              setEditingUnit(null)
              resetForm()
            }}
            className="btn btn-primary"
          >
            <Plus size={20} />
            Add Unit
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingUnit(null)
          resetForm()
          setError(null)
        }}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                {editingUnit ? 'Edit Unit' : 'Add Unit'}
              </h2>
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
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Building
                  </label>
                  <select
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value)}
                    required
                    className="input"
                  >
                    <option value="">Select building</option>
                    {buildings?.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Unit Number
                  </label>
                  <input
                    type="text"
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    required
                    className="input"
                    placeholder="A101"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Monthly Rent (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={monthlyRent}
                    onChange={(e) => setMonthlyRent(e.target.value)}
                    required
                    className="input"
                    placeholder="15000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Security Deposit (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={securityDepositAmount}
                    onChange={(e) => setSecurityDepositAmount(e.target.value)}
                    className="input"
                    placeholder="50000"
                  />
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    Default security deposit amount for this unit
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingUnit(null)
                      resetForm()
                      setError(null)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Saving...
                      </>
                    ) : (
                      'Save'
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

