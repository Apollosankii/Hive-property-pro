import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Building, getCurrentUserId } from '@/lib/supabase'
import { Plus, Edit, Trash2, Building2, AlertCircle, X, Home } from 'lucide-react'

interface UnitForm {
  id?: string
  unit_number: string
  monthly_rent: string
}

export default function Buildings() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [paymentMethodLabel, setPaymentMethodLabel] = useState('')
  const [paymentPaybill, setPaymentPaybill] = useState('')
  const [paymentAccountNumber, setPaymentAccountNumber] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [units, setUnits] = useState<UnitForm[]>([])
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: buildings, error: buildingsError, isLoading: buildingsLoading } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch buildings first
      const { data: buildingsData, error: buildingsError } = await supabase
        .from('buildings')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (buildingsError) {
        console.error('Buildings query error:', buildingsError)
        throw buildingsError
      }

      if (!buildingsData || buildingsData.length === 0) {
        console.log('No buildings found')
        return []
      }

      // Fetch units separately for each building
      const buildingsWithUnits = await Promise.all(
        buildingsData.map(async (building) => {
          const { data: unitsData, error: unitsError } = await supabase
            .from('units')
            .select('id, unit_number, monthly_rent')
            .eq('building_id', building.id)
            .order('unit_number', { ascending: true })

          if (unitsError) {
            console.error(`Error fetching units for building ${building.id}:`, unitsError)
            return { ...building, units: [] }
          }

          return {
            ...building,
            units: unitsData || []
          }
        })
      )
      
      console.log('Buildings fetched:', buildingsWithUnits.length, 'buildings')
      return buildingsWithUnits
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  // Load existing units when editing
  useEffect(() => {
    if (editingBuilding) {
      loadExistingUnits(editingBuilding.id)
    } else {
      setUnits([])
    }
  }, [editingBuilding])

  const loadExistingUnits = async (buildingId: string) => {
    const { data, error } = await supabase
      .from('units')
      .select('id, unit_number, monthly_rent')
      .eq('building_id', buildingId)
      .order('unit_number')

    if (!error && data) {
      setUnits(data.map(u => ({
        id: u.id,
        unit_number: u.unit_number,
        monthly_rent: u.monthly_rent.toString()
      })))
    }
  }

  const createMutation = useMutation({
    mutationFn: async ({
      building,
      units,
    }: {
      building: {
        name: string
        location: string
        payment_method_label?: string
        payment_paybill?: string
        payment_account_number?: string
        payment_notes?: string
      }
      units: UnitForm[]
    }) => {
      // Get current user ID - verify session first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !session.user) {
        throw new Error('User not authenticated. Please log in and try again.')
      }
      const userId = session.user.id
      
      if (!userId) {
        throw new Error('User ID not found. Please refresh the page and log in again.')
      }

      console.log('Creating building with user_id:', userId)
      console.log('Session user:', session.user)
      
      // Verify auth.uid() matches our userId (for debugging)
      const { data: { user: authUser } } = await supabase.auth.getUser()
      console.log('Auth user ID:', authUser?.id)
      
      if (authUser?.id !== userId) {
        console.warn('User ID mismatch! Session user ID:', userId, 'Auth user ID:', authUser?.id)
      }

      // Create building - user_id will be set automatically by database trigger
      // Even if we don't send it, the trigger will set it from auth.uid()
      const buildingToInsert = {
        name: building.name.trim(),
        location: building.location.trim(),
        payment_method_label: building.payment_method_label?.trim() || null,
        payment_paybill: building.payment_paybill?.trim() || null,
        payment_account_number: building.payment_account_number?.trim() || null,
        payment_notes: building.payment_notes?.trim() || null,
      }
      
      // Insert building (trigger will set user_id automatically)
      const { data: buildingData, error: buildingError } = await supabase
        .from('buildings')
        .insert([buildingToInsert])
        .select('*')
        .single()
      
      if (buildingError) {
        console.error('Create building error:', buildingError)
        console.error('Building data attempted:', buildingToInsert)
        console.error('Current auth.uid():', authUser?.id)
        console.error('Error code:', buildingError.code)
        console.error('Error message:', buildingError.message)
        
        // Provide more helpful error message
        if (buildingError.code === '42501') {
          throw new Error('Row Level Security policy violation. Please ensure you are logged in and the RLS policies are correctly configured. Check the browser console for details.')
        }
        throw buildingError
      }

      // Create units if any (user_id will be set automatically by trigger)
      if (units.length > 0 && buildingData) {
        const unitsToInsert = units
          .filter(u => u.unit_number.trim() && u.monthly_rent)
          .map(u => ({
            building_id: buildingData.id,
            unit_number: u.unit_number.trim(),
            monthly_rent: parseFloat(u.monthly_rent) || 0,
            status: 'vacant' as const
            // user_id will be automatically set by database trigger
          }))

        if (unitsToInsert.length > 0) {
          const { error: unitsError } = await supabase
            .from('units')
            .insert(unitsToInsert)

          if (unitsError) {
            console.error('Create units error:', unitsError)
            throw unitsError
          }
        }
      }

      return buildingData
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['buildings'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['occupancy-report'] })
      await queryClient.invalidateQueries({ queryKey: ['buildings-list-payments'] })
      await queryClient.refetchQueries({ queryKey: ['buildings'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['occupancy-report'] })
      setIsModalOpen(false)
      setName('')
      setLocation('')
      setPaymentMethodLabel('')
      setPaymentPaybill('')
      setPaymentAccountNumber('')
      setPaymentNotes('')
      setUnits([])
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to create building:', error)
      setError(error.message || 'Failed to create building. Please check your Supabase configuration.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, building, units }: { id: string, building: Partial<Building>, units: UnitForm[] }) => {
      // Get current user ID
      const userId = await getCurrentUserId()
      if (!userId) {
        throw new Error('User not authenticated')
      }

      // Update building
      const { data: buildingData, error: buildingError } = await supabase
        .from('buildings')
        .update(building)
        .eq('id', id)
        .select()
        .single()
      
      if (buildingError) {
        console.error('Update building error:', buildingError)
        throw buildingError
      }

      // Get existing units
      const { data: existingUnits } = await supabase
        .from('units')
        .select('id')
        .eq('building_id', id)

      const existingUnitIds = new Set(existingUnits?.map(u => u.id) || [])
      const formUnitIds = new Set(units.filter(u => u.id).map(u => u.id!))

      // Delete units that were removed
      const unitsToDelete = Array.from(existingUnitIds).filter(id => !formUnitIds.has(id))
      if (unitsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('units')
          .delete()
          .in('id', unitsToDelete)

        if (deleteError) {
          console.error('Delete units error:', deleteError)
          throw deleteError
        }
      }

      // Update or create units
      for (const unit of units) {
        if (!unit.unit_number.trim() || !unit.monthly_rent) continue

        if (unit.id) {
          // Update existing unit
          const { error: updateError } = await supabase
            .from('units')
            .update({
              unit_number: unit.unit_number.trim(),
              monthly_rent: parseFloat(unit.monthly_rent) || 0
            })
            .eq('id', unit.id)

          if (updateError) {
            console.error('Update unit error:', updateError)
            throw updateError
          }
        } else {
          // Create new unit (user_id will be set automatically by trigger)
          const { error: createError } = await supabase
            .from('units')
            .insert([{
              building_id: id,
              unit_number: unit.unit_number.trim(),
              monthly_rent: parseFloat(unit.monthly_rent) || 0,
              status: 'vacant' as const
              // user_id will be automatically set by database trigger
            }])

          if (createError) {
            console.error('Create unit error:', createError)
            throw createError
          }
        }
      }

      return buildingData
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['buildings'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['occupancy-report'] })
      await queryClient.invalidateQueries({ queryKey: ['buildings-list-payments'] })
      await queryClient.refetchQueries({ queryKey: ['buildings'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['occupancy-report'] })
      setIsModalOpen(false)
      setEditingBuilding(null)
      setName('')
      setLocation('')
      setPaymentMethodLabel('')
      setPaymentPaybill('')
      setPaymentAccountNumber('')
      setPaymentNotes('')
      setUnits([])
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to update building:', error)
      setError(error.message || 'Failed to update building. Please check your Supabase configuration.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('buildings').delete().eq('id', id)
      if (error) {
        console.error('Delete building error:', error)
        throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['buildings'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['occupancy-report'] })
      await queryClient.invalidateQueries({ queryKey: ['buildings-list-payments'] })
      await queryClient.refetchQueries({ queryKey: ['buildings'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['occupancy-report'] })
    },
    onError: (error: any) => {
      console.error('Failed to delete building:', error)
      alert(error.message || 'Failed to delete building. Please check your Supabase configuration.')
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('You must be logged in to perform this action. Please refresh the page and log in again.')
      return
    }

    // Validate units
    const validUnits = units.filter(u => u.unit_number.trim() && u.monthly_rent)
    const duplicateUnits = validUnits.filter((u, i) => 
      validUnits.findIndex(v => v.unit_number.trim().toLowerCase() === u.unit_number.trim().toLowerCase()) !== i
    )

    if (duplicateUnits.length > 0) {
      setError('Duplicate unit numbers found. Please ensure each unit has a unique number.')
      return
    }

    if (editingBuilding) {
      updateMutation.mutate({
        id: editingBuilding.id,
        building: {
          name,
          location,
          payment_method_label: paymentMethodLabel.trim() || null,
          payment_paybill: paymentPaybill.trim() || null,
          payment_account_number: paymentAccountNumber.trim() || null,
          payment_notes: paymentNotes.trim() || null,
        },
        units: validUnits,
      })
    } else {
      createMutation.mutate({
        building: {
          name,
          location,
          payment_method_label: paymentMethodLabel.trim() || null,
          payment_paybill: paymentPaybill.trim() || null,
          payment_account_number: paymentAccountNumber.trim() || null,
          payment_notes: paymentNotes.trim() || null,
        },
        units: validUnits,
      })
    }
  }

  const addUnit = () => {
    setUnits([...units, { unit_number: '', monthly_rent: '' }])
  }

  const removeUnit = (index: number) => {
    setUnits(units.filter((_, i) => i !== index))
  }

  const updateUnit = (index: number, field: keyof UnitForm, value: string) => {
    const updated = [...units]
    updated[index] = { ...updated[index], [field]: value }
    setUnits(updated)
  }

  const handleEdit = async (building: Building) => {
    setEditingBuilding(building)
    setName(building.name)
    setLocation(building.location)
    setPaymentMethodLabel(building.payment_method_label ?? '')
    setPaymentPaybill(building.payment_paybill ?? '')
    setPaymentAccountNumber(building.payment_account_number ?? '')
    setPaymentNotes(building.payment_notes ?? '')
    setIsModalOpen(true)
    await loadExistingUnits(building.id)
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this building?')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Buildings
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Manage your property buildings</p>
        </div>
        <button
          onClick={() => {
            setIsModalOpen(true)
            setEditingBuilding(null)
            setName('')
            setLocation('')
            setPaymentMethodLabel('')
            setPaymentPaybill('')
            setPaymentAccountNumber('')
            setPaymentNotes('')
            setUnits([])
            setError(null)
          }}
          className="btn btn-primary"
        >
          <Plus size={20} />
          Add Building
        </button>
      </div>

      {buildingsError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900 mb-1">Error loading buildings</p>
          <p className="text-sm text-red-700">{buildingsError.message || 'Failed to load buildings. Please check your Supabase configuration and ensure you are logged in.'}</p>
        </div>
      )}

      {buildingsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card">
              <div className="skeleton h-32 rounded-xl"></div>
            </div>
          ))}
        </div>
      ) : buildings && buildings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {buildings.map((building: any) => (
            <div key={building.id} className="card card-hover group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl shadow-lg shadow-primary-500/20">
                    <Building2 className="text-white" size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-slate-900">{building.name}</h3>
                    <p className="text-sm text-slate-600 mt-0.5">{building.location}</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1.5 bg-slate-100 rounded-lg">
                    <span className="text-sm font-semibold text-slate-700">
                      {building.units?.length || 0} {building.units?.length === 1 ? 'Unit' : 'Units'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(building)}
                    className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                    title="Edit"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(building.id)}
                    className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-16">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="text-slate-400" size={40} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No buildings yet</h3>
          <p className="text-slate-600 mb-6">Get started by adding your first building</p>
          <button
            onClick={() => {
              setIsModalOpen(true)
              setEditingBuilding(null)
              setName('')
              setLocation('')
              setPaymentMethodLabel('')
              setPaymentPaybill('')
              setPaymentAccountNumber('')
              setPaymentNotes('')
            }}
            className="btn btn-primary"
          >
            <Plus size={20} />
            Add Building
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingBuilding(null)
          setName('')
          setLocation('')
          setPaymentMethodLabel('')
          setPaymentPaybill('')
          setPaymentAccountNumber('')
          setPaymentNotes('')
          setUnits([])
          setError(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                {editingBuilding ? 'Edit Building' : 'Add Building'}
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
                    Building Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="input"
                    placeholder="Building A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    required
                    className="input"
                    placeholder="Nairobi, Kenya"
                  />
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <p className="text-sm font-semibold text-slate-800 mb-3">Tenant payment instructions (optional)</p>
                  <p className="text-xs text-slate-500 mb-3">
                    Shown on invoices and receipts for this building. Leave blank to use the global payment info from Billing.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">How to pay (label)</label>
                      <input
                        type="text"
                        value={paymentMethodLabel}
                        onChange={(e) => setPaymentMethodLabel(e.target.value)}
                        className="input"
                        placeholder="e.g. M-Pesa Paybill"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Paybill / till</label>
                      <input
                        type="text"
                        value={paymentPaybill}
                        onChange={(e) => setPaymentPaybill(e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Account / phone</label>
                      <input
                        type="text"
                        value={paymentAccountNumber}
                        onChange={(e) => setPaymentAccountNumber(e.target.value)}
                        className="input"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                      <textarea
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                        className="input"
                        rows={2}
                        placeholder="Short instructions for tenants"
                      />
                    </div>
                  </div>
                </div>

                {/* Units Section */}
                <div className="border-t border-slate-200 pt-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Units
                      </label>
                      <p className="text-xs text-slate-500">Add units to this building (optional)</p>
                    </div>
                    <button
                      type="button"
                      onClick={addUnit}
                      className="btn btn-secondary text-sm"
                    >
                      <Plus size={16} />
                      Add Unit
                    </button>
                  </div>

                  {units.length > 0 && (
                    <div className="space-y-3">
                      {units.map((unit, index) => (
                        <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                  Unit Number
                                </label>
                                <input
                                  type="text"
                                  value={unit.unit_number}
                                  onChange={(e) => updateUnit(index, 'unit_number', e.target.value)}
                                  className="input text-sm"
                                  placeholder="A101"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                                  Monthly Rent (KES)
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={unit.monthly_rent}
                                  onChange={(e) => updateUnit(index, 'monthly_rent', e.target.value)}
                                  className="input text-sm"
                                  placeholder="15000"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeUnit(index)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors mt-6"
                              title="Remove unit"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {units.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                      <Home className="text-slate-400 mx-auto mb-2" size={24} />
                      <p className="text-sm text-slate-500">No units added yet</p>
                      <p className="text-xs text-slate-400 mt-1">Click "Add Unit" to get started</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingBuilding(null)
                      setName('')
                      setLocation('')
                      setPaymentMethodLabel('')
                      setPaymentPaybill('')
                      setPaymentAccountNumber('')
                      setPaymentNotes('')
                      setUnits([])
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


