import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Employee } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Briefcase, AlertCircle, X, DollarSign } from 'lucide-react'

export default function Employees() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [hireDate, setHireDate] = useState('')
  const [salaryAmount, setSalaryAmount] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive' | 'terminated'>('active')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: employees, error: employeesError, isLoading: employeesLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('Employees query error:', error)
        throw error
      }
      
      return data || []
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const createMutation = useMutation({
    mutationFn: async (employeeData: any) => {
      const { error } = await supabase
        .from('employees')
        .insert([employeeData])
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      await queryClient.refetchQueries({ queryKey: ['employees'] })
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      console.error('Failed to create employee:', error)
      setError(error.message || 'Failed to create employee')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...employeeData }: any) => {
      const { error } = await supabase
        .from('employees')
        .update(employeeData)
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      await queryClient.refetchQueries({ queryKey: ['employees'] })
      setIsModalOpen(false)
      setEditingEmployee(null)
      resetForm()
    },
    onError: (error: any) => {
      console.error('Failed to update employee:', error)
      setError(error.message || 'Failed to update employee')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      await queryClient.refetchQueries({ queryKey: ['employees'] })
    },
    onError: (error: any) => {
      console.error('Failed to delete employee:', error)
      alert('Failed to delete employee: ' + (error.message || 'Unknown error'))
    },
  })

  const resetForm = () => {
    setName('')
    setPhone('')
    setEmail('')
    setPosition('')
    setDepartment('')
    setHireDate('')
    setSalaryAmount('')
    setStatus('active')
    setNotes('')
    setError(null)
  }

  const handleOpenModal = (employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee)
      setName(employee.name)
      setPhone(employee.phone)
      setEmail(employee.email || '')
      setPosition(employee.position)
      setDepartment(employee.department || '')
      setHireDate(employee.hire_date)
      setSalaryAmount(employee.salary_amount.toString())
      setStatus(employee.status)
      setNotes(employee.notes || '')
    } else {
      setEditingEmployee(null)
      resetForm()
    }
    setError(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('You must be logged in to perform this action')
      return
    }

    const employeeData = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      position: position.trim(),
      department: department.trim() || null,
      hire_date: hireDate,
      salary_amount: parseFloat(salaryAmount) || 0,
      status,
      notes: notes.trim() || null,
    }

    if (editingEmployee) {
      updateMutation.mutate({ id: editingEmployee.id, ...employeeData })
    } else {
      createMutation.mutate(employeeData)
    }
  }

  if (employeesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-zinc-400">Loading employees...</p>
        </div>
      </div>
    )
  }

  if (employeesError) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle size={24} />
          <p>Error loading employees: {employeesError.message || 'Unknown error'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Employees
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Manage employee information and salaries</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Employee
        </button>
      </div>

      {employees && employees.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Phone</th>
                  <th>Salary</th>
                  <th>Hire Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee: Employee) => (
                  <tr key={employee.id}>
                    <td className="font-semibold text-xs">
                      <span className="truncate block max-w-[100px] sm:max-w-none" title={employee.name}>
                        {employee.name}
                      </span>
                    </td>
                    <td className="text-xs">
                      <span className="truncate block max-w-[80px] sm:max-w-none" title={employee.position}>
                        {employee.position}
                      </span>
                    </td>
                    <td className="text-xs">{employee.department || '-'}</td>
                    <td className="text-xs">{employee.phone}</td>
                    <td className="text-xs">{formatCurrency(employee.salary_amount)}</td>
                    <td className="text-xs">{formatDate(employee.hire_date)}</td>
                    <td>
                      <span className={`badge text-[10px] px-1.5 py-0.5 ${
                        employee.status === 'active' ? 'badge-success' :
                        employee.status === 'inactive' ? 'badge-warning' :
                        'badge-danger'
                      }`}>
                        {employee.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setSelectedEmployee(employee)
                            setShowSalaryModal(true)
                          }}
                          className="p-1 text-slate-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                          title="Manage Salary"
                        >
                          <DollarSign size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenModal(employee)}
                          className="p-1 text-slate-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete ${employee.name}?`)) {
                              deleteMutation.mutate(employee.id)
                            }
                          }}
                          className="p-1 text-slate-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                          title="Delete"
                        >
                          <Trash2 size={14} />
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
          <Briefcase className="mx-auto text-slate-400 dark:text-zinc-600 mb-4" size={48} />
          <p className="text-slate-600 dark:text-zinc-400 mb-4">No employees added yet</p>
          <button onClick={() => handleOpenModal()} className="btn btn-primary">
            <Plus size={20} className="mr-2" />
            Add First Employee
          </button>
        </div>
      )}

      {/* Employee Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsModalOpen(false)
          setEditingEmployee(null)
          setError(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
              </h2>
              
              {error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-300 mb-1">Error</p>
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Full Name <span className="text-red-500">*</span>
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
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="input"
                      placeholder="+254 700 000 000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Email
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
                      Position <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      required
                      className="input"
                      placeholder="Manager, Caretaker, etc."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Department
                    </label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="input"
                      placeholder="Maintenance, Security, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Hire Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={hireDate}
                      onChange={(e) => setHireDate(e.target.value)}
                      required
                      className="input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Monthly Salary (KES) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={salaryAmount}
                      onChange={(e) => setSalaryAmount(e.target.value)}
                      required
                      className="input"
                      placeholder="50000"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Status <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      required
                      className="input"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="terminated">Terminated</option>
                    </select>
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
                    placeholder="Additional notes about the employee..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingEmployee(null)
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
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        {editingEmployee ? 'Update' : 'Create'} Employee
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Salary Management Modal - Will be implemented in separate component */}
      {showSalaryModal && selectedEmployee && (
        <SalaryManagement
          employee={selectedEmployee}
          onClose={() => {
            setShowSalaryModal(false)
            setSelectedEmployee(null)
          }}
        />
      )}
    </div>
  )
}

// Salary Management Component
function SalaryManagement({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [baseSalary, setBaseSalary] = useState(employee.salary_amount.toString())
  const [bonuses, setBonuses] = useState('0')
  const [deductions, setDeductions] = useState('0')
  const [amountPaid, setAmountPaid] = useState('0')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'bank'>('cash')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: salaries } = useQuery({
    queryKey: ['salaries', employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salaries')
        .select('*')
        .eq('employee_id', employee.id)
        .order('salary_month', { ascending: false })
      
      if (error) throw error
      return data || []
    },
  })

  const createSalaryMutation = useMutation({
    mutationFn: async (salaryData: any) => {
      // Check if salary record already exists for this month
      const { data: existingSalary } = await supabase
        .from('salaries')
        .select('id')
        .eq('employee_id', employee.id)
        .eq('salary_month', selectedMonth + '-01')
        .single()
      
      if (existingSalary) {
        // Update existing salary record
        const { error } = await supabase
          .from('salaries')
          .update(salaryData)
          .eq('id', existingSalary.id)
        
        if (error) throw error
      } else {
        // Create new salary record
        const { error } = await supabase
          .from('salaries')
          .insert([salaryData])
        
        if (error) throw error
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['salaries'] })
      await queryClient.invalidateQueries({ queryKey: ['salaries', employee.id] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.refetchQueries({ queryKey: ['salaries', employee.id] })
      alert('Salary recorded successfully!')
      onClose()
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to record salary')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const totalAmount = (parseFloat(baseSalary) || 0) + (parseFloat(bonuses) || 0) - (parseFloat(deductions) || 0)
    const paidAmount = parseFloat(amountPaid) || 0
    
    // Calculate status based on amount paid
    let status: 'pending' | 'partial' | 'paid' = 'pending'
    if (paidAmount >= totalAmount) {
      status = 'paid'
    } else if (paidAmount > 0) {
      status = 'partial'
    }

    const salaryData = {
      employee_id: employee.id,
      salary_month: selectedMonth + '-01',
      base_salary: parseFloat(baseSalary) || 0,
      bonuses: parseFloat(bonuses) || 0,
      deductions: parseFloat(deductions) || 0,
      amount_paid: paidAmount,
      payment_date: paymentDate || null,
      payment_method: paymentMethod || null,
      status: status,
      notes: notes.trim() || null,
    }

    createSalaryMutation.mutate(salaryData)
  }

  const totalAmount = (parseFloat(baseSalary) || 0) + (parseFloat(bonuses) || 0) - (parseFloat(deductions) || 0)
  const balance = totalAmount - (parseFloat(amountPaid) || 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
            Manage Salary - {employee.name}
          </h2>
          <p className="text-slate-600 dark:text-zinc-400 mb-6">Record salary payment for {employee.position}</p>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl">
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                Salary Month <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                required
                className="input [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Base Salary
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  required
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Bonuses
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={bonuses}
                  onChange={(e) => setBonuses(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Deductions
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={deductions}
                  onChange={(e) => setDeductions(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-slate-700 dark:text-zinc-200">Total Amount:</span>
                <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Amount Paid
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Balance
                </label>
                <input
                  type="text"
                  value={formatCurrency(balance)}
                  disabled
                  className="input bg-slate-50 dark:bg-zinc-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="input"
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank">Bank Transfer</option>
                </select>
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
              />
            </div>

            {salaries && salaries.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold text-slate-700 dark:text-zinc-200 mb-3">Salary History</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {salaries.map((salary: any) => (
                    <div key={salary.id} className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg flex justify-between items-center">
                      <div>
                        <p className="font-medium">{new Date(salary.salary_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                        <p className="text-sm text-slate-600 dark:text-zinc-400">{formatCurrency(salary.total_amount)} - {salary.status}</p>
                      </div>
                      <span className={`badge ${
                        salary.status === 'paid' ? 'badge-success' :
                        salary.status === 'partial' ? 'badge-warning' :
                        'badge-danger'
                      }`}>
                        {salary.status}
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
                disabled={createSalaryMutation.isPending}
              >
                {createSalaryMutation.isPending ? 'Saving...' : 'Record Salary'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

