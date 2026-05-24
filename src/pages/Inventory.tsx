import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, type Inventory } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Package, TrendingUp, TrendingDown } from 'lucide-react'

export default function Inventory() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showTransactionModal, setShowTransactionModal] = useState(false)
  const [editingItem, setEditingItem] = useState<Inventory | null>(null)
  const [selectedItem, setSelectedItem] = useState<Inventory | null>(null)
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

  const { data: inventory, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('item_name')
      
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: true,
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
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
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
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setIsModalOpen(false)
      setEditingItem(null)
      resetForm()
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to update inventory item')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
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

  const totalValue = inventory?.reduce((sum, item) => sum + (item.total_value || 0), 0) || 0
  const lowStockItems = inventory?.filter(item => item.status === 'low_stock' || item.status === 'out_of_stock') || []

  if (inventoryLoading) {
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-zinc-50 dark:to-zinc-200 bg-clip-text text-transparent">
            Inventory
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 mt-1">
            Total Value: {formatCurrency(totalValue)} | 
            {lowStockItems.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400 ml-2">
                {lowStockItems.length} item(s) need restocking
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Item
        </button>
      </div>

      {inventory && inventory.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="table responsive-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit Cost</th>
                  <th>Total Value</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item: Inventory) => (
                  <tr key={item.id}>
                    <td data-label="Item Name" className="font-semibold">{item.item_name}</td>
                    <td data-label="Category">{item.category || '-'}</td>
                    <td data-label="Quantity">
                      {item.quantity} {item.unit}
                      {item.quantity <= item.min_quantity && (
                        <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">⚠ Low</span>
                      )}
                    </td>
                    <td data-label="Unit Cost">{formatCurrency(item.unit_cost)}</td>
                    <td data-label="Total Value" className="font-semibold">{formatCurrency(item.total_value)}</td>
                    <td data-label="Status">
                      <span className={`badge ${
                        item.status === 'in_stock' ? 'badge-success' :
                        item.status === 'low_stock' ? 'badge-warning' :
                        'badge-danger'
                      }`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td data-label="Location">{item.location || '-'}</td>
                    <td data-label="Actions">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedItem(item)
                            setShowTransactionModal(true)
                          }}
                          className="p-2 text-slate-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
                          title="Add Transaction"
                        >
                          {item.quantity > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                        </button>
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="p-2 text-slate-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete ${item.item_name}?`)) {
                              deleteMutation.mutate(item.id)
                            }
                          }}
                          className="p-2 text-slate-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
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
        </div>
      ) : (
        <div className="card text-center py-12">
          <Package className="mx-auto text-slate-400 dark:text-zinc-600 mb-4" size={48} />
          <p className="text-slate-600 dark:text-zinc-400 mb-4">No inventory items added yet</p>
          <button onClick={() => handleOpenModal()} className="btn btn-primary">
            <Plus size={20} className="mr-2" />
            Add First Item
          </button>
        </div>
      )}

      {/* Inventory Item Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingItem(null)
          setError(null)
        }}>
          <div className="modal-content max-w-full sm:max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                {editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
              </h2>
              
              {error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Item Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    required
                    className="input"
                    placeholder="e.g., Paint, Plumbing supplies"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Category
                    </label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="input"
                      placeholder="e.g., Maintenance, Office supplies"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Unit <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      required
                      className="input"
                      placeholder="e.g., piece, kg, liter, box"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Min Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={minQuantity}
                      onChange={(e) => setMinQuantity(e.target.value)}
                      required
                      className="input"
                      placeholder="Alert threshold"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Unit Cost (KES) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={unitCost}
                      onChange={(e) => setUnitCost(e.target.value)}
                      required
                      className="input"
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
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Location
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="input"
                      placeholder="Storage location"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Supplier
                    </label>
                    <input
                      type="text"
                      value={supplier}
                      onChange={(e) => setSupplier(e.target.value)}
                      className="input"
                      placeholder="Supplier name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="input"
                    rows={3}
                    placeholder="Item description..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input"
                    rows={2}
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingItem(null)
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
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingItem ? 'Update' : 'Create'} Item
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransactionModal && selectedItem && (
        <InventoryTransactionModal
          item={selectedItem}
          onClose={() => {
            setShowTransactionModal(false)
            setSelectedItem(null)
          }}
        />
      )}
    </div>
  )
}

// Inventory Transaction Component
function InventoryTransactionModal({ item, onClose }: { item: Inventory; onClose: () => void }) {
  const [transactionType, setTransactionType] = useState<'purchase' | 'sale' | 'adjustment' | 'usage'>('purchase')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState(item.unit_cost.toString())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: transactions } = useQuery({
    queryKey: ['inventory-transactions', item.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('inventory_id', item.id)
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      return data || []
    },
  })

  const createTransactionMutation = useMutation({
    mutationFn: async (transactionData: any) => {
      // For purchases, quantity is positive; for sales/usage, it's negative
      const qty = transactionType === 'purchase' ? Math.abs(parseFloat(quantity)) : -Math.abs(parseFloat(quantity))
      
      const { error } = await supabase
        .from('inventory_transactions')
        .insert([{
          ...transactionData,
          quantity: qty,
        }])
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] })
      await queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })
      alert('Transaction recorded successfully!')
      onClose()
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to record transaction')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const transactionData = {
      inventory_id: item.id,
      transaction_type: transactionType,
      quantity: parseFloat(quantity) || 0,
      unit_cost: parseFloat(unitCost) || item.unit_cost,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    }

    createTransactionMutation.mutate(transactionData)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-full sm:max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
            Add Transaction - {item.item_name}
          </h2>
          <p className="text-slate-600 dark:text-zinc-400 mb-6">Current stock: {item.quantity} {item.unit}</p>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                Transaction Type <span className="text-red-500">*</span>
              </label>
              <select
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value as any)}
                required
                className="input"
              >
                <option value="purchase">Purchase (Add Stock)</option>
                <option value="sale">Sale (Remove Stock)</option>
                <option value="usage">Usage (Remove Stock)</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="input"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Unit Cost (KES)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                Reference (Invoice/Order #)
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="input"
                placeholder="Optional reference number"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input"
                rows={3}
              />
            </div>

            {transactions && transactions.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-slate-700 dark:text-zinc-200 mb-3">Recent Transactions</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {transactions.map((tx: any) => (
                    <div key={tx.id} className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium">{tx.transaction_type} - {Math.abs(tx.quantity)} {item.unit}</p>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">{formatDate(tx.created_at)}</p>
                      </div>
                      <span className={tx.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                        {tx.quantity > 0 ? '+' : ''}{tx.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 btn btn-primary"
                disabled={createTransactionMutation.isPending}
              >
                {createTransactionMutation.isPending ? 'Saving...' : 'Record Transaction'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}


