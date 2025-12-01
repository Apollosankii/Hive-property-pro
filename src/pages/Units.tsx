import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Unit } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, Edit } from 'lucide-react'

export default function Units() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null)
  const [unitNumber, setUnitNumber] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const queryClient = useQueryClient()

  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const { data } = await supabase.from('buildings').select('*').order('name')
      return data || []
    },
  })

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('units')
        .select('*, buildings(name), tenants(name)')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (newUnit: Partial<Unit>) => {
      const { data, error } = await supabase
        .from('units')
        .insert([newUnit])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setIsModalOpen(false)
      resetForm()
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
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setIsModalOpen(false)
      setEditingUnit(null)
      resetForm()
    },
  })

  const resetForm = () => {
    setUnitNumber('')
    setBuildingId('')
    setMonthlyRent('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const unitData = {
      building_id: buildingId,
      unit_number: unitNumber,
      monthly_rent: parseFloat(monthlyRent),
      status: 'vacant' as const,
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
    setIsModalOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Units</h1>
        <button
          onClick={() => {
            setIsModalOpen(true)
            setEditingUnit(null)
            resetForm()
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Unit
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Unit Number</th>
              <th>Building</th>
              <th>Status</th>
              <th>Tenant</th>
              <th>Monthly Rent</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {units?.map((unit: any) => (
              <tr key={unit.id}>
                <td className="font-medium">{unit.unit_number}</td>
                <td>{unit.buildings?.name || 'N/A'}</td>
                <td>
                  <span
                    className={`badge ${
                      unit.status === 'occupied'
                        ? 'badge-success'
                        : 'badge-warning'
                    }`}
                  >
                    {unit.status}
                  </span>
                </td>
                <td>{unit.tenants?.name || 'Vacant'}</td>
                <td className="font-semibold">
                  {formatCurrency(unit.monthly_rent)}
                </td>
                <td>
                  <button
                    onClick={() => handleEdit(unit)}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                  >
                    <Edit size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingUnit ? 'Edit Unit' : 'Add Unit'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditingUnit(null)
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

