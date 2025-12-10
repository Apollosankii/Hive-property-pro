import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Tenant } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, Users, AlertCircle, CheckCircle, Edit, Search, User } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function CaretakerTenants() {
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
  const [securityDepositAmount, setSecurityDepositAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const queryClient = useQueryClient()

  const uploadPhoto = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Math.random()}.${fileExt}`
    const filePath = `tenant-photos/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('tenant-photos')
      .upload(filePath, file)

    if (uploadError) {
      throw new Error(`Failed to upload photo: ${uploadError.message}`)
    }

    const { data } = supabase.storage
      .from('tenant-photos')
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  // Fetch all tenants (RLS will filter to show only manager's tenants)
  const { data: tenants, isLoading: tenantsLoading, error: tenantsError } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.error('CaretakerTenants: No session found')
        throw new Error('Not authenticated')
      }
      
      console.log('CaretakerTenants: Fetching tenants for user:', session.user.id)
      
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
      
      if (tenantsError) {
        console.error('CaretakerTenants: Error fetching tenants:', tenantsError)
        throw tenantsError
      }
      
      console.log('CaretakerTenants: Fetched', tenantsData?.length || 0, 'tenants')
      
      // Fetch units and bills for each tenant
      const tenantsWithRelations = await Promise.all(
        (tenantsData || []).map(async (tenant: any) => {
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
      
      // Sort by unit number descending
      tenantsWithRelations.sort((a: any, b: any) => {
        const unitA = a.units?.unit_number
        const unitB = b.units?.unit_number
        
        if (unitA && unitB) {
          const numA = typeof unitA === 'string' ? parseFloat(unitA) || 0 : unitA
          const numB = typeof unitB === 'string' ? parseFloat(unitB) || 0 : unitB
          return numB - numA
        }
        
        if (unitA && !unitB) return -1
        if (!unitA && unitB) return 1
        return 0
      })
      
      return tenantsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  const { data: vacantUnits } = useQuery({
    queryKey: ['vacant-units'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_number, building_id')
        .eq('status', 'vacant')
        .order('unit_number')
      
      if (error) throw error
      
      const unitsWithBuildings = await Promise.all(
        (data || []).map(async (unit: any) => {
          if (unit.building_id) {
            const { data: buildingData } = await supabase
              .from('buildings')
              .select('name')
              .eq('id', unit.building_id)
              .single()
            return { ...unit, building_name: buildingData?.name || '' }
          }
          return { ...unit, building_name: '' }
        })
      )
      
      return unitsWithBuildings
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: { tenantData: Partial<Tenant> & { id_photo_url?: string }, securityDepositAmount?: string }) => {
      const { tenantData, securityDepositAmount } = data
      
      const { data: tenantResult, error } = await supabase
        .from('tenants')
        .insert([tenantData])
        .select()
        .single()
      
      if (error) throw error

      // Update unit status
      if (tenantData.unit_id) {
        await supabase
          .from('units')
          .update({ status: 'occupied', tenant_id: tenantResult.id })
          .eq('id', tenantData.unit_id)
      }

      // Create security deposit if amount provided
      if (securityDepositAmount && parseFloat(securityDepositAmount) > 0) {
        const depositAmount = parseFloat(securityDepositAmount)
        const { error: depositError } = await supabase
          .from('security_deposits')
          .insert([{
            tenant_id: tenantResult.id,
            unit_id: tenantData.unit_id,
            amount: depositAmount,
            status: 'held',
          }])
        
        if (depositError) {
          console.error('Failed to create security deposit:', depositError)
          // Don't throw - tenant is already created
        }
      }

      return tenantResult
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      await queryClient.invalidateQueries({ queryKey: ['vacant-units'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      setIsModalOpen(false)
      resetForm()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to create tenant')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...tenantData }: Partial<Tenant> & { id: string }) => {
      const { error } = await supabase
        .from('tenants')
        .update(tenantData)
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setIsModalOpen(false)
      setEditingTenant(null)
      resetForm()
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to update tenant')
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
    setSecurityDepositAmount('')
    setError(null)
  }

  const handleEdit = (tenant: Tenant) => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (!phone.trim()) {
      setError('Phone number is required')
      return
    }

    try {
      let photoUrl = editingTenant?.id_photo_url
      if (idPhoto) {
        photoUrl = await uploadPhoto(idPhoto)
      }

      if (editingTenant) {
        updateMutation.mutate({
          id: editingTenant.id,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          unit_id: unitId || undefined,
          id_photo_url: photoUrl,
          emergency_contact_name: emergencyContactName.trim() || undefined,
          emergency_contact_phone: emergencyContactPhone.trim() || undefined,
          emergency_contact_relationship: emergencyContactRelationship.trim() || undefined,
        })
      } else {
        if (!unitId) {
          setError('Please select a unit')
          return
        }

        createMutation.mutate({
          tenantData: {
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
            unit_id: unitId,
            id_photo_url: photoUrl,
            emergency_contact_name: emergencyContactName.trim() || undefined,
            emergency_contact_phone: emergencyContactPhone.trim() || undefined,
            emergency_contact_relationship: emergencyContactRelationship.trim() || undefined,
            status: 'active',
          },
          securityDepositAmount: securityDepositAmount || undefined,
        })
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    }
  }

  const filteredTenants = tenants?.filter((t: any) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.phone.includes(searchTerm) ||
    t.units?.unit_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-zinc-100">Tenant Onboarding</h1>
          <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
            View and manage all tenants
          </p>
        </div>
        <button
          onClick={() => {
            setIsModalOpen(true)
            setEditingTenant(null)
            resetForm()
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          <span className="hidden sm:inline">New Tenant</span>
        </button>
      </div>

      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3">
          <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
          <p className="text-sm text-green-700 dark:text-green-300">
            {editingTenant ? 'Tenant updated successfully!' : 'Tenant created successfully!'}
          </p>
        </div>
      )}

      {tenantsError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Error Loading Tenants</p>
          <p className="text-xs text-red-600 dark:text-red-400">{tenantsError.message || 'Failed to load tenants. Check browser console for details.'}</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            Possible causes: RLS policies not configured, data ownership mismatch, or caretaker not properly linked to manager.
          </p>
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
          <div className="overflow-x-auto">
            <table className="table w-full text-xs sm:text-sm">
              <thead>
                <tr>
                  <th>Photo</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Unit</th>
                  <th>Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((tenant: any) => {
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
                        <Link to={`/tenants/${tenant.id}`} className="font-medium text-primary-600 dark:text-primary-400 hover:underline">
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
              <Users className="text-slate-400" size={40} />
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
                <Plus size={20} className="mr-2" />
                Add First Tenant
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingTenant(null)
          resetForm()
        }}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-100 mb-4">
                {editingTenant ? 'Edit Tenant' : 'Onboard New Tenant'}
              </h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input w-full"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input w-full"
                    placeholder="+254 700 000 000"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input w-full"
                    placeholder="tenant@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    {editingTenant ? 'Change Unit (Optional)' : 'Assign Unit'} <span className="text-red-500">{!editingTenant && '*'}</span>
                  </label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="input w-full"
                    required={!editingTenant}
                  >
                    <option value="">{editingTenant ? 'Keep current unit' : 'Select a unit'}</option>
                    {vacantUnits?.map((unit: any) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_number} {unit.building_name ? `- ${unit.building_name}` : ''}
                      </option>
                    ))}
                  </select>
                  {vacantUnits && vacantUnits.length === 0 && !editingTenant && (
                    <p className="text-xs text-amber-600 mt-1">No vacant units available</p>
                  )}
                </div>

                {!editingTenant && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Security Deposit Amount (KES)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={securityDepositAmount}
                      onChange={(e) => setSecurityDepositAmount(e.target.value)}
                      className="input w-full"
                      placeholder="Enter amount paid"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Enter the security deposit amount paid by the tenant
                    </p>
                  </div>
                )}

                <div className="border-t border-slate-200 dark:border-zinc-700 pt-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-4">Emergency Contact</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                        Emergency Contact Name
                      </label>
                      <input
                        type="text"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        className="input w-full"
                        placeholder="Jane Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                        Emergency Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        className="input w-full"
                        placeholder="+254 700 000 000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                        Relationship
                      </label>
                      <input
                        type="text"
                        value={emergencyContactRelationship}
                        onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                        className="input w-full"
                        placeholder="Spouse, Parent, Sibling, etc."
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    ID/Passport Photo
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setIdPhoto(e.target.files?.[0] || null)}
                    className="input w-full"
                  />
                  {editingTenant?.id_photo_url && !idPhoto && (
                    <img
                      src={editingTenant.id_photo_url}
                      alt="Current photo"
                      className="mt-2 w-24 h-24 object-cover rounded-xl border border-slate-200 dark:border-zinc-700"
                    />
                  )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingTenant(null)
                      resetForm()
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
                    {createMutation.isPending || updateMutation.isPending 
                      ? 'Saving...' 
                      : editingTenant 
                        ? 'Update Tenant' 
                        : 'Create Tenant'}
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
