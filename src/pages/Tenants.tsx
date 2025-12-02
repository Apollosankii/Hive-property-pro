import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Tenant } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { importTenantsFromExcel } from '@/lib/excel-import'
import { Plus, Edit, User, Search, AlertCircle, X, Upload, FileSpreadsheet } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Tenants() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [unitId, setUnitId] = useState('')
  const [idPhoto, setIdPhoto] = useState<File | null>(null)
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [importMessage, setImportMessage] = useState('')
  const [importResult, setImportResult] = useState<{ success: number; errors: string[] } | null>(null)
  const queryClient = useQueryClient()

  const { data: units, error: unitsError } = useQuery({
    queryKey: ['units-for-tenants', editingTenant?.id],
    queryFn: async () => {
      // Check authentication first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Get all units first
      const { data: allUnits, error: unitsError } = await supabase
        .from('units')
        .select('id, unit_number, building_id, status, tenant_id')
        .order('unit_number')
      
      if (unitsError) {
        console.error('Units query error:', unitsError)
        throw unitsError
      }
      
      if (!allUnits || allUnits.length === 0) {
        console.log('No units found in database')
        return []
      }

      // Fetch building names separately
      const unitsWithBuildings = await Promise.all(
        (allUnits || []).map(async (unit: any) => {
          let buildingName = null
          if (unit.building_id) {
            const { data: buildingData } = await supabase
              .from('buildings')
              .select('name')
              .eq('id', unit.building_id)
              .single()
            buildingName = buildingData?.name || null
          }
          
          return {
            ...unit,
            buildings: buildingName ? { name: buildingName } : null
          }
        })
      )
      
      // Filter: show vacant units, or if editing, also show the currently assigned unit
      if (editingTenant?.unit_id) {
        return unitsWithBuildings.filter(
          (u: any) => u.status === 'vacant' || u.id === editingTenant.unit_id
        )
      } else {
        return unitsWithBuildings.filter((u: any) => u.status === 'vacant')
      }
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: tenants, error: tenantsError, isLoading: tenantsLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      // Check authentication first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch tenants first
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (tenantsError) {
        console.error('Tenants query error:', tenantsError)
        throw tenantsError
      }
      
      if (!tenantsData || tenantsData.length === 0) {
        console.log('No tenants found in database')
        return []
      }
      
      console.log('Tenants fetched:', tenantsData.length, 'tenants')
      
      // Fetch units and bills separately for each tenant
      const tenantsWithRelations = await Promise.all(
        tenantsData.map(async (tenant: any) => {
          const [unitRes, billsRes] = await Promise.all([
            tenant.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', tenant.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            supabase
              .from('bills')
              .select('balance')
              .eq('tenant_id', tenant.id)
          ])
          
          // If unit found, get building name
          let unitWithBuilding = null
          if (unitRes.data) {
            if (unitRes.data.building_id) {
              const { data: buildingData } = await supabase
                .from('buildings')
                .select('name')
                .eq('id', unitRes.data.building_id)
                .single()
              
              unitWithBuilding = {
                unit_number: unitRes.data.unit_number,
                buildings: buildingData ? { name: buildingData.name } : null
              }
            } else {
              unitWithBuilding = {
                unit_number: unitRes.data.unit_number,
                buildings: null
              }
            }
          }
          
          return {
            ...tenant,
            units: unitWithBuilding,
            bills: billsRes.data || []
          }
        })
      )
      
      return tenantsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    retry: 2,
  })

  const uploadPhoto = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const { data, error } = await supabase.storage
      .from('tenant-photos')
      .upload(fileName, file)

    if (error) throw error
    const { data: { publicUrl } } = supabase.storage
      .from('tenant-photos')
      .getPublicUrl(data.path)
    return publicUrl
  }

  const createMutation = useMutation({
    mutationFn: async (newTenant: Partial<Tenant> & { id_photo_url?: string }) => {
      const { data, error } = await supabase
        .from('tenants')
        .insert([newTenant])
        .select()
        .single()
      
      if (error) {
        console.error('Create tenant error:', error)
        throw error
      }

      // Update unit status to occupied
      if (newTenant.unit_id) {
        const { error: unitError } = await supabase
          .from('units')
          .update({ status: 'occupied', tenant_id: data.id })
          .eq('id', newTenant.unit_id)

        if (unitError) {
          console.error('Update unit error:', unitError)
          throw unitError
        }

        // Create security deposit record
        const { data: unitData } = await supabase
          .from('units')
          .select('security_deposit_amount')
          .eq('id', newTenant.unit_id)
          .single()

        if (unitData && unitData.security_deposit_amount > 0) {
          const { error: depositError } = await supabase
            .from('security_deposits')
            .insert([{
              tenant_id: data.id,
              unit_id: newTenant.unit_id,
              amount: unitData.security_deposit_amount,
              date_deposited: new Date().toISOString().split('T')[0],
              status: 'active'
            }])

          if (depositError) {
            console.error('Create security deposit error:', depositError)
            // Don't throw - tenant creation succeeded, deposit is optional
          }
        }
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['occupied-units'] })
      await queryClient.invalidateQueries({ queryKey: ['occupancy-report'] })
      await queryClient.refetchQueries({ queryKey: ['tenants'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['occupied-units'] })
      await queryClient.refetchQueries({ queryKey: ['occupancy-report'] })
      setIsModalOpen(false)
      resetForm()
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to create tenant:', error)
      setError(error.message || 'Failed to create tenant. Please check your Supabase configuration.')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, oldUnitId, ...updates }: Partial<Tenant> & { id: string, oldUnitId?: string }) => {
      const { data, error } = await supabase
        .from('tenants')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) {
        console.error('Update tenant error:', error)
        throw error
      }

      // Handle unit assignment changes
      const newUnitId = updates.unit_id
      
      // If unit was changed, update old unit to vacant
      if (oldUnitId && oldUnitId !== newUnitId) {
        const { error: oldUnitError } = await supabase
          .from('units')
          .update({ status: 'vacant', tenant_id: null })
          .eq('id', oldUnitId)

        if (oldUnitError) {
          console.error('Update old unit error:', oldUnitError)
          throw oldUnitError
        }
      }

      // If new unit assigned, update it to occupied
      if (newUnitId && newUnitId !== oldUnitId) {
        const { error: newUnitError } = await supabase
          .from('units')
          .update({ status: 'occupied', tenant_id: id })
          .eq('id', newUnitId)

        if (newUnitError) {
          console.error('Update new unit error:', newUnitError)
          throw newUnitError
        }
      }

      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['occupied-units'] })
      await queryClient.invalidateQueries({ queryKey: ['occupancy-report'] })
      await queryClient.refetchQueries({ queryKey: ['tenants'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['occupied-units'] })
      await queryClient.refetchQueries({ queryKey: ['occupancy-report'] })
      setIsModalOpen(false)
      setEditingTenant(null)
      resetForm()
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to update tenant:', error)
      setError(error.message || 'Failed to update tenant. Please check your Supabase configuration.')
    },
  })

  const resetForm = () => {
    setName('')
    setPhone('')
    setEmail('')
    setUnitId('')
    setIdPhoto(null)
    setEmergencyContactName('')
    setEmergencyContactPhone('')
    setEmergencyContactRelationship('')
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
    
    try {
      let photoUrl = editingTenant?.id_photo_url
      if (idPhoto) {
        photoUrl = await uploadPhoto(idPhoto)
      }

      if (!unitId && !editingTenant) {
        setError('Please select a unit for the tenant')
        return
      }

      const tenantData = {
        name,
        phone,
        email: email || undefined,
        unit_id: unitId || undefined,
        id_photo_url: photoUrl,
        emergency_contact_name: emergencyContactName || undefined,
        emergency_contact_phone: emergencyContactPhone || undefined,
        emergency_contact_relationship: emergencyContactRelationship || undefined,
        status: 'active' as const,
      }

      if (editingTenant) {
        updateMutation.mutate({ 
          id: editingTenant.id, 
          oldUnitId: editingTenant.unit_id || undefined,
          ...tenantData 
        })
      } else {
        createMutation.mutate(tenantData)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    }
  }

  const handleEdit = (tenant: any) => {
    setEditingTenant(tenant)
    setName(tenant.name)
    setPhone(tenant.phone)
    setEmail(tenant.email || '')
    setUnitId(tenant.unit_id || '')
    setEmergencyContactName(tenant.emergency_contact_name || '')
    setEmergencyContactPhone(tenant.emergency_contact_phone || '')
    setEmergencyContactRelationship(tenant.emergency_contact_relationship || '')
    setIsModalOpen(true)
  }

  const handleImport = async () => {
    if (!importFile) {
      setError('Please select an Excel file')
      return
    }

    setError(null)
    setImportProgress(0)
    setImportMessage('Starting import...')
    setImportResult(null)

    try {
      const result = await importTenantsFromExcel(importFile, (progress, message) => {
        setImportProgress(progress)
        setImportMessage(message)
      })

      setImportResult(result)
      setImportMessage(`Import completed: ${result.success} successful, ${result.errors.length} errors`)

      // Refresh tenants list
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      await queryClient.refetchQueries({ queryKey: ['tenants'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.refetchQueries({ queryKey: ['units'] })
    } catch (err: any) {
      setError(err.message || 'Failed to import tenants')
      setImportMessage('Import failed')
    }
  }

  const filteredTenants = tenants?.filter((t: any) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.phone.includes(searchTerm) ||
    t.units?.unit_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Tenants
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Manage tenant information and records</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="btn btn-secondary"
          >
            <Upload size={20} />
            Import Excel
          </button>
          <button
            onClick={() => {
              setIsModalOpen(true)
              setEditingTenant(null)
              resetForm()
            }}
            className="btn btn-primary"
          >
            <Plus size={20} />
            Add Tenant
          </button>
        </div>
      </div>

      {tenantsError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-900 mb-1">Error loading tenants</p>
          <p className="text-sm text-red-700">{tenantsError.message || 'Failed to load tenants. Please check your Supabase configuration and ensure you are logged in.'}</p>
        </div>
      )}

      <div className="card">
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tenants by name, phone, or unit..."
              className="input pl-12"
            />
          </div>
        </div>

        {tenantsLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Loading tenants...</p>
          </div>
        ) : filteredTenants && filteredTenants.length > 0 ? (
          <div className="overflow-x-auto w-full">
            <table className="table w-full text-xs sm:text-sm">
              <thead>
                <tr>
                  <th className="w-[60px] sm:w-[80px]">Photo</th>
                  <th className="w-[100px] sm:w-[140px]">Name</th>
                  <th className="w-[100px] sm:w-[120px]">Phone</th>
                  <th className="w-[120px] sm:w-[160px]">Email</th>
                  <th className="w-[80px] sm:w-[100px]">Unit</th>
                  <th className="w-[80px] sm:w-[100px]">Balance</th>
                  <th className="w-[70px] sm:w-[80px]">Status</th>
                  <th className="w-[90px] sm:w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((tenant: any) => {
                  // Handle bills - it might be an array or object
                  const billsArray = Array.isArray(tenant.bills) ? tenant.bills : (tenant.bills ? [tenant.bills] : [])
                  const totalBalance = billsArray.reduce((sum: number, b: any) => sum + (b.balance || 0), 0)
                  return (
                    <tr key={tenant.id}>
                      <td>
                        {tenant.id_photo_url ? (
                          <img
                            src={tenant.id_photo_url}
                            alt={tenant.name}
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
                            <User size={16} className="text-gray-400 dark:text-zinc-500" />
                          </div>
                        )}
                      </td>
                      <td className="text-xs">
                        <Link to={`/tenants/${tenant.id}`} className="font-medium text-primary-600 dark:text-primary-400 hover:underline truncate block max-w-[80px] sm:max-w-none" title={tenant.name}>
                          {tenant.name}
                        </Link>
                      </td>
                      <td className="text-xs">{tenant.phone}</td>
                      <td className="text-xs">
                        <span className="truncate block max-w-[100px] sm:max-w-none" title={tenant.email || 'N/A'}>
                          {tenant.email || 'N/A'}
                        </span>
                      </td>
                      <td className="text-xs">
                        {tenant.units ? (
                          <>
                            <span className="whitespace-nowrap">{tenant.units.unit_number}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:inline block">
                              {tenant.units.buildings?.name}
                            </span>
                          </>
                        ) : (
                          'Unassigned'
                        )}
                      </td>
                      <td className={`text-xs ${totalBalance > 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {formatCurrency(totalBalance)}
                      </td>
                      <td>
                        <span className={`badge text-[10px] px-1.5 py-0.5 ${tenant.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleEdit(tenant)}
                          className="p-1 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-all"
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="text-slate-400" size={40} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {searchTerm ? 'No tenants found' : 'No tenants yet'}
            </h3>
            <p className="text-slate-600 mb-6">
              {searchTerm ? 'Try adjusting your search terms' : 'Get started by adding your first tenant'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => {
                  setIsModalOpen(true)
                  setEditingTenant(null)
                  resetForm()
                }}
                className="btn btn-primary"
              >
                <Plus size={20} />
                Add Tenant
              </button>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingTenant(null)
          resetForm()
          setError(null)
        }}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                {editingTenant ? 'Edit Tenant' : 'Add Tenant'}
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
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="input"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    className="input"
                    placeholder="+254700000000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Unit <span className="text-red-500">*</span>
                  </label>
                  {unitsError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mb-1">
                      Error loading units: {unitsError.message}
                    </p>
                  )}
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    required
                    className="input"
                  >
                    <option value="">Select unit (required)</option>
                    {units && units.length > 0 ? (
                      units.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.unit_number} {u.buildings?.name ? `- ${u.buildings.name}` : ''} {u.status === 'occupied' ? '(Occupied)' : ''}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        {unitsError ? 'Error loading units' : 'No vacant units available'}
                      </option>
                    )}
                  </select>
                  {units && units.length === 0 && !unitsError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      No vacant units found. Please create units first or assign a tenant to an occupied unit when editing.
                    </p>
                  )}
                </div>
                <div className="border-t border-slate-200 pt-5">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Emergency Contact</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Emergency Contact Name
                      </label>
                      <input
                        type="text"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        className="input"
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Emergency Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        className="input"
                        placeholder="+254700000000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Relationship
                      </label>
                      <input
                        type="text"
                        value={emergencyContactRelationship}
                        onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                        className="input"
                        placeholder="Spouse, Parent, Sibling, etc."
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    ID/Passport Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
                    className="input"
                  />
                  {editingTenant?.id_photo_url && !idPhoto && (
                    <img
                      src={editingTenant.id_photo_url}
                      alt="Current photo"
                      className="mt-2 w-24 h-24 object-cover rounded-xl border border-slate-200"
                    />
                  )}
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingTenant(null)
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
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Import Tenants from Excel</h2>
              
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

              {importResult && (
                <div className={`mb-4 p-4 border rounded-xl ${importResult.errors.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                  <p className={`text-sm font-semibold mb-2 ${importResult.errors.length > 0 ? 'text-yellow-900' : 'text-green-900'}`}>
                    Import Results: {importResult.success} successful, {importResult.errors.length} errors
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="max-h-40 overflow-y-auto">
                      <ul className="text-xs text-yellow-800 list-disc list-inside space-y-1">
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
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Select Excel File
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="input"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Expected columns: Unit, Names (or Name), Phone, Email (optional), Emergency Contact Name (optional), Emergency Contact Phone (optional), Emergency Contact Relationship (optional)
                  </p>
                </div>

                {importProgress > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">{importMessage}</span>
                      <span className="text-sm font-semibold text-slate-700">{Math.round(importProgress)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
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
                    onClick={handleImport}
                    disabled={!importFile || importProgress > 0}
                    className="flex-1 btn btn-primary"
                  >
                    <FileSpreadsheet size={18} />
                    Import
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

