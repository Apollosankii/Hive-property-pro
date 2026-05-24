import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Inventory } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, Edit, Package, AlertCircle } from 'lucide-react'

export default function CaretakerInventory() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Inventory | null>(null)
  const [itemName, setItemName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('0')
  const [unit, setUnit] = useState('unit')
  const [minQuantity, setMinQuantity] = useState('0')
  const [unitCost, setUnitCost] = useState('0')
  const [location, setLocation] = useState('')
  const [supplier, setSupplier] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: inventory, isLoading, error: inventoryError } = useQuery({
    queryKey: ['inventory', 'caretaker'],
    queryFn: async () => {
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.error('CaretakerInventory: No session found')
        throw new Error('Not authenticated')
      }
      
      // Get caretaker's assigned buildings
      const { data: caretakerData } = await supabase
        .from('caretakers')
        .select(`
          id,
          caretaker_buildings (
            building_id
          )
        `)
        .eq('user_id', session.user.id)
        .single()
      
      if (!caretakerData) {
        throw new Error('Caretaker record not found')
      }
      
      const buildingIds = caretakerData.caretaker_buildings?.map((cb: any) => cb.building_id) || []
      
      if (buildingIds.length === 0) {
        console.warn('CaretakerInventory: No buildings assigned to caretaker')
        return []
      }
      
      console.log('CaretakerInventory: Fetching inventory for buildings:', buildingIds)
      
      // Check if inventory table has building_id column
      // If it does, filter by building_id; otherwise show all (for backward compatibility)
      let query = supabase
        .from('inventory')
        .select('*')
      
      // Try to filter by building_id if the column exists
      // Note: This will fail gracefully if the column doesn't exist
      try {
        query = query.in('building_id', buildingIds)
      } catch (e) {
        // If building_id doesn't exist, we'll show all inventory
        // In production, you should add building_id to inventory table
        console.warn('CaretakerInventory: building_id column not found, showing all inventory')
      }
      
      const { data, error } = await query.order('item_name')
      
      if (error) {
        console.error('CaretakerInventory: Error fetching inventory:', error)
        throw error
      }
      
      console.log('CaretakerInventory: Fetched', data?.length || 0, 'items')
      return data || []
    },
  })

  const createMutation = useMutation({
    mutationFn: async (itemData: any) => {
      const { error } = await supabase
        .from('inventory')
        .insert([itemData])
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to create inventory item')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...itemData }: any) => {
      const { error } = await supabase
        .from('inventory')
        .update(itemData)
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] })
      setIsModalOpen(false)
      setEditingItem(null)
      resetForm()
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to update inventory item')
    },
  })

  const resetForm = () => {
    setItemName('')
    setDescription('')
    setCategory('')
    setQuantity('0')
    setUnit('unit')
    setMinQuantity('0')
    setUnitCost('0')
    setLocation('')
    setSupplier('')
    setNotes('')
    setError(null)
  }

  const handleOpenModal = (item?: Inventory) => {
    if (item) {
      setEditingItem(item)
      setItemName(item.item_name)
      setDescription(item.description || '')
      setCategory(item.category || '')
      setQuantity(item.quantity.toString())
      setUnit(item.unit)
      setMinQuantity(item.min_quantity.toString())
      setUnitCost(item.unit_cost.toString())
      setLocation(item.location || '')
      setSupplier(item.supplier || '')
      setNotes(item.notes || '')
    } else {
      setEditingItem(null)
      resetForm()
    }
    setIsModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const itemData = {
      item_name: itemName.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      quantity: parseFloat(quantity) || 0,
      unit: unit.trim() || 'unit',
      min_quantity: parseFloat(minQuantity) || 0,
      unit_cost: parseFloat(unitCost) || 0,
      location: location.trim() || null,
      supplier: supplier.trim() || null,
      notes: notes.trim() || null,
    }

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, ...itemData })
    } else {
      createMutation.mutate(itemData)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-zinc-400">Loading inventory...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {inventoryError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Error Loading Inventory</p>
          <p className="text-xs text-red-600 dark:text-red-400">{inventoryError.message || 'Failed to load inventory. Check browser console for details.'}</p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            Possible causes: RLS policies not configured, data ownership mismatch, or caretaker not properly linked to manager.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 dark:text-zinc-100">Inventory</h1>
          <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
            {inventory?.length || 0} items
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          <span className="hidden sm:inline">Add Item</span>
        </button>
      </div>

      {inventory && inventory.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {inventory.map((item) => (
            <div
              key={item.id}
              className="card p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="text-primary-600" size={20} />
                  <h3 className="font-semibold text-slate-900 dark:text-zinc-100">{item.item_name}</h3>
                </div>
                <button
                  onClick={() => handleOpenModal(item)}
                  className="p-1 text-slate-600 hover:text-primary-600"
                >
                  <Edit size={16} />
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600 dark:text-zinc-400">Quantity:</span>
                  <span className="font-semibold">{item.quantity} {item.unit}</span>
                </div>
                {item.location && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Location:</span>
                    <span className="font-semibold">{item.location}</span>
                  </div>
                )}
                {item.status === 'low_stock' && (
                  <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Low Stock</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <Package className="text-slate-400 mx-auto mb-4" size={48} />
          <p className="text-slate-600 dark:text-zinc-400">No inventory items yet</p>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingItem(null)
          resetForm()
        }}>
          <div className="modal-content max-w-full sm:max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-100 mb-4">
                {editingItem ? 'Edit Item' : 'Add Item'}
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
                    Item Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="input w-full"
                    placeholder="e.g., Paint, Plumbing supplies"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Category
                    </label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="input w-full"
                      placeholder="e.g., Maintenance, Office supplies"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Unit <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="input w-full"
                      placeholder="e.g., piece, kg, liter, box"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="input w-full"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Min Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={minQuantity}
                      onChange={(e) => setMinQuantity(e.target.value)}
                      className="input w-full"
                      placeholder="Alert threshold"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Unit Cost (KES) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      className="input w-full"
                      required
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-700 dark:text-zinc-200">Total Value:</span>
                    <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
                      {formatCurrency((parseFloat(quantity) || 0) * (parseFloat(unitCost) || 0))}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="input w-full"
                      placeholder="Storage location"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                      Supplier
                    </label>
                    <input
                      type="text"
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      className="input w-full"
                      placeholder="Supplier name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="input w-full"
                    rows={3}
                    placeholder="Item description..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input w-full"
                    rows={2}
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingItem(null)
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
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
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


