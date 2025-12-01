import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Tenant } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, Edit, User, Search } from 'lucide-react'
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
  const queryClient = useQueryClient()

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const { data } = await supabase
        .from('units')
        .select('id, unit_number, buildings(name), status')
        .eq('status', 'vacant')
        .order('unit_number')
      return data || []
    },
  })

  const { data: tenants } = useQuery({
    queryKey: ['tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*, units(unit_number, buildings(name)), bills!left(balance)')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },
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
      
      if (error) throw error

      // Update unit status to occupied
      if (newTenant.unit_id) {
        await supabase
          .from('units')
          .update({ status: 'occupied', tenant_id: data.id })
          .eq('id', newTenant.unit_id)
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setIsModalOpen(false)
      resetForm()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const { data, error } = await supabase
        .from('tenants')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setIsModalOpen(false)
      setEditingTenant(null)
      resetForm()
    },
  })

  const resetForm = () => {
    setName('')
    setPhone('')
    setEmail('')
    setUnitId('')
    setIdPhoto(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    let photoUrl = editingTenant?.id_photo_url
    if (idPhoto) {
      photoUrl = await uploadPhoto(idPhoto)
    }

    const tenantData = {
      name,
      phone,
      email: email || undefined,
      unit_id: unitId || undefined,
      id_photo_url: photoUrl,
      status: 'active' as const,
    }

    if (editingTenant) {
      updateMutation.mutate({ id: editingTenant.id, ...tenantData })
    } else {
      createMutation.mutate(tenantData)
    }
  }

  const handleEdit = (tenant: any) => {
    setEditingTenant(tenant)
    setName(tenant.name)
    setPhone(tenant.phone)
    setEmail(tenant.email || '')
    setUnitId(tenant.unit_id || '')
    setIsModalOpen(true)
  }

  const filteredTenants = tenants?.filter((t: any) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.phone.includes(searchTerm) ||
    t.units?.unit_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Tenants</h1>
        <button
          onClick={() => {
            setIsModalOpen(true)
            setEditingTenant(null)
            resetForm()
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Tenant
        </button>
      </div>

      <div className="card">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tenants..."
              className="input pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Photo</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Unit</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants?.map((tenant: any) => {
                const totalBalance = tenant.bills?.reduce((sum: number, b: any) => sum + (b.balance || 0), 0) || 0
                return (
                  <tr key={tenant.id}>
                    <td>
                      {tenant.id_photo_url ? (
                        <img
                          src={tenant.id_photo_url}
                          alt={tenant.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          <User size={20} className="text-gray-400" />
                        </div>
                      )}
                    </td>
                    <td>
                      <Link to={`/tenants/${tenant.id}`} className="font-medium text-primary-600 hover:underline">
                        {tenant.name}
                      </Link>
                    </td>
                    <td>{tenant.phone}</td>
                    <td>{tenant.email || 'N/A'}</td>
                    <td>
                      {tenant.units
                        ? `${tenant.units.unit_number} (${tenant.units.buildings?.name})`
                        : 'Unassigned'}
                    </td>
                    <td className={totalBalance > 0 ? 'font-semibold text-red-600' : 'text-green-600'}>
                      {formatCurrency(totalBalance)}
                    </td>
                    <td>
                      <span className={`badge ${tenant.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                        {tenant.status}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleEdit(tenant)}
                        className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">
              {editingTenant ? 'Edit Tenant' : 'Add Tenant'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assign Unit (Optional)
                </label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="input"
                >
                  <option value="">Select unit</option>
                  {units?.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_number} - {u.buildings?.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    className="mt-2 w-24 h-24 object-cover rounded"
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
                    : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

