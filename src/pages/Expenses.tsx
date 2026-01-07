import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Expense } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Wallet } from 'lucide-react'

export default function Expenses() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<'maintenance' | 'utilities' | 'supplies' | 'insurance' | 'taxes' | 'legal' | 'marketing' | 'other'>('other')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0])
  const [vendor, setVendor] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const queryClient = useQueryClient()

  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('id, name')
        .order('name')
      
      if (error) throw error
      return data || []
    },
  })

  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
      
      if (error) throw error
      
      // Fetch related data
      const expensesWithRelations = await Promise.all(
        (data || []).map(async (expense: any) => {
          const [buildingRes, unitRes] = await Promise.all([
            expense.building_id
              ? supabase.from('buildings').select('name').eq('id', expense.building_id).single()
              : Promise.resolve({ data: null, error: null }),
            expense.unit_id
              ? supabase.from('units').select('unit_number').eq('id', expense.unit_id).single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          return {
            ...expense,
            buildings: buildingRes.data ? { name: buildingRes.data.name } : null,
            units: unitRes.data ? { unit_number: unitRes.data.unit_number } : null
          }
        })
      )
      
      return expensesWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  const createMutation = useMutation({
    mutationFn: async (expenseData: any) => {
      const { error } = await supabase
        .from('expenses')
        .insert([expenseData])
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to create expense')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...expenseData }: any) => {
      const { error } = await supabase
        .from('expenses')
        .update(expenseData)
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      setIsModalOpen(false)
      setEditingExpense(null)
      resetForm()
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to update expense')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const resetForm = () => {
    setDescription('')
    setCategory('other')
    setAmount('')
    setExpenseDate(new Date().toISOString().split('T')[0])
    setVendor('')
    setBuildingId('')
    setUnitId('')
    setNotes('')
    setError(null)
  }

  const handleOpenModal = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense)
      setDescription(expense.description)
      setCategory(expense.category)
      setAmount(expense.amount.toString())
      setExpenseDate(expense.expense_date)
      setVendor(expense.vendor || '')
      setBuildingId(expense.building_id || '')
      setUnitId(expense.unit_id || '')
      setNotes(expense.notes || '')
    } else {
      setEditingExpense(null)
      resetForm()
    }
    setIsModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const expenseData = {
      description: description.trim(),
      category,
      amount: parseFloat(amount) || 0,
      expense_date: expenseDate,
      vendor: vendor.trim() || null,
      building_id: buildingId || null,
      unit_id: unitId || null,
      notes: notes.trim() || null,
    }

    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, ...expenseData })
    } else {
      createMutation.mutate(expenseData)
    }
  }

  // Filter expenses by selected month
  const filteredExpenses = expenses?.filter(expense => {
    const expenseMonth = expense.expense_date.slice(0, 7)
    return expenseMonth === selectedMonth
  }) || []

  const filteredTotal = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0) || 0

  if (expensesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-zinc-400">Loading expenses...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-zinc-50 dark:to-zinc-200 bg-clip-text text-transparent">
            Expenses
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 mt-1">
            {selectedMonth && `${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: `}
            {formatCurrency(filteredTotal)}
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Expense
        </button>
      </div>

      {/* Monthly Filter */}
      <div className="card">
        <div className="flex items-center gap-4">
          <label className="text-sm font-semibold text-slate-700 dark:text-zinc-200">
            Filter by Month:
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input w-32"
          />
        </div>
      </div>

      {expenses && filteredExpenses.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Vendor</th>
                  <th>Building/Unit</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((expense: any) => (
                  <tr key={expense.id}>
                    <td>{formatDate(expense.expense_date)}</td>
                    <td className="font-medium">{expense.description}</td>
                    <td>
                      <span className="badge badge-info">{expense.category}</span>
                    </td>
                    <td className="font-semibold">{formatCurrency(expense.amount)}</td>
                    <td>{expense.vendor || '-'}</td>
                    <td>
                      {expense.buildings?.name || expense.units?.unit_number || '-'}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenModal(expense)}
                          className="p-2 text-slate-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-xl transition-all"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this expense?')) {
                              deleteMutation.mutate(expense.id)
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
          <Wallet className="mx-auto text-slate-400 dark:text-zinc-600 mb-4" size={48} />
          <p className="text-slate-600 dark:text-zinc-400 mb-4">
            {expenses && expenses.length > 0 
              ? `No expenses for ${new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
              : 'No expenses recorded yet'
            }
          </p>
          <button onClick={() => handleOpenModal()} className="btn btn-primary">
            <Plus size={20} className="mr-2" />
            Add First Expense
          </button>
        </div>
      )}

      {/* Expense Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingExpense(null)
          setError(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                {editingExpense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              
              {error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl">
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    className="input"
                    placeholder="e.g., Plumbing repair, Office supplies"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as any)}
                      required
                      className="input"
                    >
                      <option value="maintenance">Maintenance</option>
                      <option value="utilities">Utilities</option>
                      <option value="supplies">Supplies</option>
                      <option value="insurance">Insurance</option>
                      <option value="taxes">Taxes</option>
                      <option value="legal">Legal</option>
                      <option value="marketing">Marketing</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Amount (KES) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      className="input"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Expense Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      required
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Vendor
                    </label>
                    <input
                      type="text"
                      value={vendor}
                      onChange={(e) => setVendor(e.target.value)}
                      className="input"
                      placeholder="Vendor/Supplier name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Building (Optional)
                    </label>
                    <select
                      value={buildingId}
                      onChange={(e) => setBuildingId(e.target.value)}
                      className="input"
                    >
                      <option value="">Select building</option>
                      {buildings?.map((building: any) => (
                        <option key={building.id} value={building.id}>
                          {building.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Unit (Optional)
                    </label>
                    <input
                      type="text"
                      value={unitId}
                      onChange={(e) => setUnitId(e.target.value)}
                      className="input"
                      placeholder="Unit ID (if applicable)"
                    />
                  </div>
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
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingExpense(null)
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
                    {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingExpense ? 'Update' : 'Create'} Expense
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

