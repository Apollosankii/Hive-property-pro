import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Building } from '@/lib/supabase'
import { Plus, Edit, Trash2, Building2 } from 'lucide-react'

export default function Buildings() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const queryClient = useQueryClient()

  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*, units(id)')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (newBuilding: { name: string; location: string }) => {
      const { data, error } = await supabase
        .from('buildings')
        .insert([newBuilding])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings'] })
      setIsModalOpen(false)
      setName('')
      setLocation('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Building> & { id: string }) => {
      const { data, error } = await supabase
        .from('buildings')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings'] })
      setIsModalOpen(false)
      setEditingBuilding(null)
      setName('')
      setLocation('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('buildings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buildings'] })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingBuilding) {
      updateMutation.mutate({ id: editingBuilding.id, name, location })
    } else {
      createMutation.mutate({ name, location })
    }
  }

  const handleEdit = (building: Building) => {
    setEditingBuilding(building)
    setName(building.name)
    setLocation(building.location)
    setIsModalOpen(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this building?')) {
      deleteMutation.mutate(id)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Buildings</h1>
        <button
          onClick={() => {
            setIsModalOpen(true)
            setEditingBuilding(null)
            setName('')
            setLocation('')
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Building
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {buildings?.map((building: any) => (
          <div key={building.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <Building2 className="text-primary-600" size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{building.name}</h3>
                  <p className="text-sm text-gray-600">{building.location}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <span className="text-sm text-gray-600">
                {building.units?.length || 0} Units
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(building)}
                  className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                >
                  <Edit size={18} />
                </button>
                <button
                  onClick={() => handleDelete(building.id)}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">
              {editingBuilding ? 'Edit Building' : 'Add Building'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    setEditingBuilding(null)
                    setName('')
                    setLocation('')
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

