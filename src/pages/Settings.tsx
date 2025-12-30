import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { supabase, UtilityType } from '@/lib/supabase'
import { Save, Plus, Edit, Trash2, X, AlertCircle } from 'lucide-react'

export default function Settings() {
  const { user } = useAuthStore()
  const [waterRate, setWaterRate] = useState('')
  const [elecRate, setElecRate] = useState('')
  const [isUtilityModalOpen, setIsUtilityModalOpen] = useState(false)
  const [editingUtility, setEditingUtility] = useState<UtilityType | null>(null)
  const [utilityFormData, setUtilityFormData] = useState({
    name: '',
    rate: '',
    unit_name: 'unit',
    description: '',
    display_order: '0',
  })
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

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

  const { data: utilityTypes, isLoading: utilityTypesLoading } = useQuery({
    queryKey: ['utility-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('utility_types')
        .select('*')
        .order('display_order', { ascending: true })
      
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  const updateMutation = useMutation({
    mutationFn: async (newSettings: { water_rate: number; elec_rate: number }) => {
      localStorage.setItem('app-settings', JSON.stringify(newSettings))
      return newSettings
    },
    onSuccess: (newSettings) => {
      // Invalidate and refetch settings query to ensure all components get updated values
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.setQueryData(['settings'], newSettings)
      // Reset local state to show saved values
      setWaterRate('')
      setElecRate('')
      alert('Settings saved successfully!')
    },
  })

  const createUtilityMutation = useMutation({
    mutationFn: async (utilityData: any) => {
      const { data, error } = await supabase
        .from('utility_types')
        .insert([utilityData])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
      setIsUtilityModalOpen(false)
      setEditingUtility(null)
      setUtilityFormData({
        name: '',
        rate: '',
        unit_name: 'unit',
        description: '',
        display_order: '0',
      })
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to create utility type:', error)
      setError(error.message || 'Failed to create utility type')
    },
  })

  const updateUtilityMutation = useMutation({
    mutationFn: async ({ id, ...utilityData }: any) => {
      const { data, error } = await supabase
        .from('utility_types')
        .update(utilityData)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
      setIsUtilityModalOpen(false)
      setEditingUtility(null)
      setUtilityFormData({
        name: '',
        rate: '',
        unit_name: 'unit',
        description: '',
        display_order: '0',
      })
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to update utility type:', error)
      setError(error.message || 'Failed to update utility type')
    },
  })

  const deleteUtilityMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('utility_types')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
    },
    onError: (error: any) => {
      console.error('Failed to delete utility type:', error)
      alert('Failed to delete utility type: ' + (error.message || 'Unknown error'))
    },
  })

  const toggleUtilityActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('utility_types')
        .update({ is_active })
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    // Allow 0 or any positive number - save exactly what user enters
    // If empty, keep existing value; if 0, save 0; if number, save that number
    // Parse values robustly so entries like "0.0" or "00" are handled correctly.
    const parseRate = (input: string, fallback: number) => {
      if (input === '') return fallback
      const n = Number(input)
      return Number.isFinite(n) ? n : fallback
    }

    const newWaterRate = parseRate(waterRate, settings?.water_rate ?? 50)
    const newElecRate = parseRate(elecRate, settings?.elec_rate ?? 15)
    
    console.log('Saving rates:', { newWaterRate, newElecRate, waterRate, elecRate })
    
    updateMutation.mutate({
      water_rate: newWaterRate,
      elec_rate: newElecRate,
    })
  }

  const handleOpenUtilityModal = (utility?: UtilityType) => {
    if (utility) {
      setEditingUtility(utility)
      setUtilityFormData({
        name: utility.name,
        rate: utility.rate.toString(),
        unit_name: utility.unit_name,
        description: utility.description || '',
        display_order: utility.display_order.toString(),
      })
    } else {
      setEditingUtility(null)
      setUtilityFormData({
        name: '',
        rate: '',
        unit_name: 'unit',
        description: '',
        display_order: '0',
      })
    }
    setError(null)
    setIsUtilityModalOpen(true)
  }

  const handleSaveUtility = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!utilityFormData.name.trim()) {
      setError('Utility name is required')
      return
    }

    if (!utilityFormData.rate || parseFloat(utilityFormData.rate) < 0) {
      setError('Rate must be a positive number')
      return
    }

    const utilityData = {
      name: utilityFormData.name.trim(),
      rate: parseFloat(utilityFormData.rate),
      unit_name: utilityFormData.unit_name || 'unit',
      description: utilityFormData.description.trim() || null,
      display_order: parseInt(utilityFormData.display_order) || 0,
    }

    if (editingUtility) {
      updateUtilityMutation.mutate({ id: editingUtility.id, ...utilityData })
    } else {
      createUtilityMutation.mutate(utilityData)
    }
  }

  const handleDeleteUtility = (id: string) => {
    if (confirm('Are you sure you want to delete this utility type? This will remove it from all future bills.')) {
      deleteUtilityMutation.mutate(id)
    }
  }

  // Note: Caretaker management has been moved to the Employees page

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
        Settings
      </h1>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Default Utility Rates</h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Default Water Rate (KES per unit)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={waterRate !== '' ? waterRate : (settings?.water_rate?.toString() || '')}
              onChange={(e) => setWaterRate(e.target.value)}
              className="input"
              placeholder="50"
            />
            <p className="mt-1 text-xs text-slate-500">
              Default rate used when generating bills
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Default Electricity Rate (KES per unit)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={elecRate !== '' ? elecRate : (settings?.elec_rate?.toString() || '')}
              onChange={(e) => setElecRate(e.target.value)}
              className="input"
              placeholder="15"
            />
            <p className="mt-1 text-xs text-slate-500">
              Default rate used when generating bills
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary flex items-center gap-2"
            disabled={updateMutation.isPending}
          >
            <Save size={20} />
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Utility Types</h2>
            <p className="text-sm text-slate-600 mt-1">
              Configure utility types with rates (similar to water and electricity)
            </p>
          </div>
          <button
            onClick={() => handleOpenUtilityModal()}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Add Utility Type
          </button>
        </div>

        {utilityTypesLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-slate-600">Loading utility types...</p>
          </div>
        ) : utilityTypes && utilityTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rate</th>
                  <th>Unit</th>
                  <th>Description</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {utilityTypes.map((utility: UtilityType) => (
                  <tr key={utility.id}>
                    <td className="font-semibold">{utility.name}</td>
                    <td>{utility.rate.toLocaleString()} KES</td>
                    <td>{utility.unit_name}</td>
                    <td className="text-slate-600">{utility.description || '-'}</td>
                    <td>{utility.display_order}</td>
                    <td>
                      <span className={`badge ${utility.is_active ? 'badge-success' : 'badge-warning'}`}>
                        {utility.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleUtilityActiveMutation.mutate({ 
                            id: utility.id, 
                            is_active: !utility.is_active 
                          })}
                          className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                          title={utility.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {utility.is_active ? '✓' : '○'}
                        </button>
                        <button
                          onClick={() => handleOpenUtilityModal(utility)}
                          className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteUtility(utility.id)}
                          className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No utility types configured. Click "Add Utility Type" to get started.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Account Information</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Email</label>
            <p className="mt-1 text-slate-900">{user?.email}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">User ID</label>
            <p className="mt-1 text-slate-500 text-sm font-mono">{user?.id}</p>
          </div>
        </div>
      </div>

      {/* Utility Type Modal */}
      {isUtilityModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsUtilityModalOpen(false)
          setEditingUtility(null)
          setError(null)
        }}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {editingUtility ? 'Edit Utility Type' : 'Add Utility Type'}
              </h2>
              <p className="text-slate-600 mb-6">
                Configure a utility type with a rate (e.g., Garbage at 500 KES per service)
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

              <form onSubmit={handleSaveUtility} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Utility Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={utilityFormData.name}
                    onChange={(e) => setUtilityFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Garbage Collection, Cleaning Service"
                    className="input"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Rate (KES) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={utilityFormData.rate}
                      onChange={(e) => setUtilityFormData(prev => ({ ...prev, rate: e.target.value }))}
                      placeholder="500"
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Unit Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={utilityFormData.unit_name}
                      onChange={(e) => setUtilityFormData(prev => ({ ...prev, unit_name: e.target.value }))}
                      placeholder="e.g., service, kg, bag"
                      className="input"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={utilityFormData.description}
                    onChange={(e) => setUtilityFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    className="input"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={utilityFormData.display_order}
                    onChange={(e) => setUtilityFormData(prev => ({ ...prev, display_order: e.target.value }))}
                    placeholder="0"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Lower numbers appear first in billing forms
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUtilityModalOpen(false)
                      setEditingUtility(null)
                      setError(null)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={createUtilityMutation.isPending || updateUtilityMutation.isPending}
                  >
                    {createUtilityMutation.isPending || updateUtilityMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} className="mr-2" />
                        {editingUtility ? 'Update' : 'Create'} Utility Type
                      </>
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
