import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Employee, Caretaker, Building, supabaseUrl } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Briefcase, AlertCircle, X, DollarSign, Key, Copy, Check, Building2 } from 'lucide-react'

// Unified employee type that can include caretaker info
type UnifiedEmployee = Employee & {
  caretaker?: Caretaker
  isCaretaker?: boolean
}

export default function Employees() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showSalaryModal, setShowSalaryModal] = useState(false)
  const [showCredentialsModal, setShowCredentialsModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [newCaretakerCredentials, setNewCaretakerCredentials] = useState<{ email: string; password: string } | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('')
  const [hireDate, setHireDate] = useState('')
  const [salaryAmount, setSalaryAmount] = useState('')
  const [status, setStatus] = useState<'active' | 'inactive' | 'terminated'>('active')
  const [notes, setNotes] = useState('')
  const [createCaretakerAccount, setCreateCaretakerAccount] = useState(false)
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([])
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
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

  // Buildings query
  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('name')
      
      if (error) throw error
      return data || []
    },
  })

  // Caretaker queries with building assignments
  const { data: caretakers, isLoading: caretakersLoading, error: caretakersError } = useQuery({
    queryKey: ['caretakers'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('caretakers')
          .select(`
            *,
            caretaker_buildings (
              id,
              building_id,
              building:buildings (*)
            )
          `)
          .order('created_at', { ascending: false })
        
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST116' || error.message.includes('does not exist')) {
            console.warn('Caretakers table does not exist')
            return []
          }
          throw error
        }
        return data || []
      } catch (err: any) {
        if (err.message?.includes('406') || err.code === '42P01') {
          return []
        }
        throw err
      }
    },
    staleTime: 0,
    refetchOnMount: true,
    retry: false,
  })

  // Merge employees and caretakers into unified list
  const unifiedEmployees: UnifiedEmployee[] = useMemo(() => {
    if (!employees) return []
    
    const employeeMap = new Map<string, UnifiedEmployee>()
    
    // Add all employees
    employees.forEach((emp: Employee) => {
      employeeMap.set(emp.id, { ...emp, isCaretaker: false })
    })
    
    // Match caretakers to employees by email
    if (caretakers) {
      caretakers.forEach((caretaker: any) => {
        // Extract buildings from caretaker_buildings relationship
        const assignedBuildings = caretaker.caretaker_buildings?.map((cb: any) => cb.building).filter(Boolean) || []
        const caretakerWithBuildings = {
          ...caretaker,
          buildings: assignedBuildings,
        }
        
        // Try to find matching employee by email
        const matchingEmployee = employees.find(
          (emp: Employee) => emp.email?.toLowerCase() === caretaker.email.toLowerCase()
        )
        
        if (matchingEmployee) {
          // Update existing employee with caretaker info
          const unified = employeeMap.get(matchingEmployee.id)
          if (unified) {
            unified.caretaker = caretakerWithBuildings
            unified.isCaretaker = true
          }
        } else {
          // Caretaker without employee record - create a virtual employee entry
          employeeMap.set(caretaker.id, {
            id: caretaker.id,
            name: caretaker.name,
            phone: caretaker.phone || '',
            email: caretaker.email,
            position: 'Caretaker',
            department: '',
            hire_date: caretaker.created_at,
            salary_amount: 0,
            status: caretaker.status === 'active' ? 'active' : 'inactive',
            notes: 'Caretaker with portal access',
            created_at: caretaker.created_at,
            updated_at: caretaker.updated_at,
            caretaker: caretakerWithBuildings,
            isCaretaker: true,
          })
        }
      })
    }
    
    return Array.from(employeeMap.values()).sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [employees, caretakers])

  // Generate random password - simpler format for easier use
  const generatePassword = () => {
    const length = 8
    // Use only alphanumeric characters (no special characters)
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let password = ''
    // Ensure at least one uppercase, one lowercase, and one number
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)] // Uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)] // Lowercase
    password += '0123456789'[Math.floor(Math.random() * 10)] // Number
    
    // Fill the rest randomly
    for (let i = 3; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    
    // Shuffle the password characters
    return password.split('').sort(() => Math.random() - 0.5).join('')
  }

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const createMutation = useMutation({
    mutationFn: async (employeeData: any) => {
      const { data, error } = await supabase
        .from('employees')
        .insert([employeeData])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      await queryClient.refetchQueries({ queryKey: ['employees'] })
      
      // If creating caretaker account, do it after employee is created
      if (createCaretakerAccount && email.trim()) {
        const password = generatePassword()
        try {
          await createCaretakerMutation.mutateAsync({
            name: name.trim(),
            phone: phone.trim() || '',
            email: email.trim(),
            password,
            buildingIds: selectedBuildings,
          })
          // Credentials will be shown in the employee modal
        } catch (err: any) {
          setError(err.message || 'Employee created but failed to create caretaker account')
          // Don't close modal if caretaker creation failed
          return
        }
      } else {
        // If editing and updating building assignments for existing caretaker
        const unifiedEmployee = editingEmployee as UnifiedEmployee | null
        if (unifiedEmployee?.caretaker && selectedBuildings.length >= 0) {
          try {
            await assignBuildingsMutation.mutateAsync({
              caretakerId: unifiedEmployee.caretaker.id,
              buildingIds: selectedBuildings,
            })
          } catch (err: any) {
            console.error('Failed to update building assignments:', err)
            // Don't fail the whole operation
          }
        }
        setIsModalOpen(false)
        resetForm()
      }
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

  // Mutation to assign buildings to caretaker
  const assignBuildingsMutation = useMutation({
    mutationFn: async ({ caretakerId, buildingIds }: { caretakerId: string; buildingIds: string[] }) => {
      // First, delete existing assignments
      const { error: deleteError } = await supabase
        .from('caretaker_buildings')
        .delete()
        .eq('caretaker_id', caretakerId)
      
      if (deleteError) throw deleteError
      
      // Then, insert new assignments
      if (buildingIds.length > 0) {
        const assignments = buildingIds.map(buildingId => ({
          caretaker_id: caretakerId,
          building_id: buildingId,
        }))
        
        const { error: insertError } = await supabase
          .from('caretaker_buildings')
          .insert(assignments)
        
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caretakers'] })
    },
  })

  // Caretaker mutations
  const createCaretakerMutation = useMutation({
    mutationFn: async (caretakerData: { name: string; phone: string; email: string; password: string; buildingIds?: string[] }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) throw new Error('User not authenticated')

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(caretakerData.email)) {
        throw new Error('Invalid email format')
      }

      if (caretakerData.password.length < 6) {
        throw new Error('Password must be at least 6 characters')
      }

      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/create-caretaker`
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession?.access_token) {
        throw new Error('Not authenticated. Please log in again.')
      }

      const edgeResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession.access_token}`,
          'apikey': supabaseUrl.includes('supabase.co') ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpdmJsaXljZHBwbWZxZWFoeHNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDk0OTcsImV4cCI6MjA4MDEyNTQ5N30.EKYadRZq_Evt3o-ZDvQTJMZWfLmm2fIAUjwu94Zn1AE' : '',
        },
        body: JSON.stringify({
          name: caretakerData.name,
          phone: caretakerData.phone || '',
          email: caretakerData.email,
          password: caretakerData.password,
        }),
      })

      if (!edgeResponse.ok) {
        const errorText = await edgeResponse.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText || `HTTP ${edgeResponse.status}` }
        }
        throw new Error(errorData.error || `Edge function returned status ${edgeResponse.status}`)
      }

      const edgeResult = await edgeResponse.json()
      if (edgeResult.success && edgeResult.caretaker) {
        return {
          caretaker: edgeResult.caretaker,
          credentials: edgeResult.credentials,
        }
      }
      throw new Error(edgeResult.error || 'Edge function returned invalid response')
    },
    onSuccess: async (data, variables) => {
      // Assign buildings if provided
      if (variables.buildingIds && variables.buildingIds.length > 0 && data.caretaker) {
        try {
          await assignBuildingsMutation.mutateAsync({
            caretakerId: data.caretaker.id,
            buildingIds: variables.buildingIds,
          })
        } catch (err) {
          console.error('Failed to assign buildings:', err)
          // Don't fail the whole operation, just log the error
        }
      }
      
      setNewCaretakerCredentials(data.credentials)
      queryClient.invalidateQueries({ queryKey: ['caretakers'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      // Credentials will be shown in the employee modal
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to create caretaker')
    },
  })

  const deleteCaretakerMutation = useMutation({
    mutationFn: async (caretaker: Caretaker) => {
      const { error } = await supabase
        .from('caretakers')
        .delete()
        .eq('id', caretaker.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caretakers'] })
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to delete caretaker')
    },
  })

  const resetCaretakerPasswordMutation = useMutation({
    mutationFn: async (caretaker: Caretaker) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) throw new Error('User not authenticated')

      const newPassword = generatePassword()
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/reset-caretaker-password`
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (!currentSession?.access_token) {
          throw new Error('No access token')
        }

        const edgeResponse = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession.access_token}`,
          },
          body: JSON.stringify({
            caretaker_id: caretaker.id,
            user_id: caretaker.user_id,
            new_password: newPassword,
          }),
        })

        const edgeResult = await edgeResponse.json()
        if (edgeResponse.ok && edgeResult.success) {
          return { email: caretaker.email, password: newPassword }
        }
        throw new Error('Edge function unavailable')
      } catch (edgeError: any) {
        throw new Error(
          'Password reset requires Edge Function deployment. ' +
          'Please deploy the reset-caretaker-password Edge Function or manually update the password in Supabase Dashboard.'
        )
      }
    },
    onSuccess: (credentials) => {
      setNewCaretakerCredentials(credentials)
      setShowCredentialsModal(true)
      queryClient.invalidateQueries({ queryKey: ['caretakers'] })
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to reset password')
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
    setCreateCaretakerAccount(false)
    setSelectedBuildings([])
    setError(null)
  }


  const handleResetPassword = (caretaker: Caretaker) => {
    if (confirm(`Reset password for ${caretaker.name}? New credentials will be generated.`)) {
      resetCaretakerPasswordMutation.mutate(caretaker)
    }
  }

  const handleOpenModal = (employee?: UnifiedEmployee) => {
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
      setCreateCaretakerAccount(false) // Don't auto-check for existing employees
      // Load assigned buildings if caretaker
      if (employee.caretaker?.buildings) {
        setSelectedBuildings(employee.caretaker.buildings.map(b => b.id))
      } else {
        setSelectedBuildings([])
      }
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

    if (createCaretakerAccount && !email.trim()) {
      setError('Email is required to create a caretaker account')
      return
    }

    if (createCaretakerAccount && selectedBuildings.length === 0) {
      setError('Please assign at least one property to the caretaker')
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

  const isLoading = employeesLoading || caretakersLoading
  const hasError = employeesError || caretakersError

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-zinc-400">Loading employees...</p>
        </div>
      </div>
    )
  }

  if (hasError && !caretakersError) {
    return (
      <div className="card">
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle size={24} />
          <p>Error loading employees: {employeesError?.message || 'Unknown error'}</p>
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
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Manage all employees including caretakers with portal access, and track salaries
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Add Employee
        </button>
      </div>

      {/* Warning if caretakers table doesn't exist */}
      {caretakersError && (
        <div className="card bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 mb-1">Caretakers Table Not Found</p>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Please run the <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">CREATE_CARETAKERS_TABLE.sql</code> file in your Supabase SQL Editor to enable caretaker portal access.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Unified Employees List */}
      {unifiedEmployees && unifiedEmployees.length > 0 ? (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Phone</th>
                      <th>Email</th>
                      <th>Portal Access</th>
                      <th>Assigned Properties</th>
                      <th>Salary</th>
                  <th>Hire Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {unifiedEmployees.map((employee: UnifiedEmployee) => {
                  const caretaker = employee.caretaker
                  return (
                    <tr key={employee.id}>
                      <td className="font-semibold text-xs">
                        <div className="flex items-center gap-2">
                          <span className="truncate block max-w-[100px] sm:max-w-none" title={employee.name}>
                            {employee.name}
                          </span>
                          {employee.isCaretaker && (
                            <span title="Caretaker with portal access">
                              <Key size={14} className="text-primary-600 dark:text-primary-400" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-xs">
                        <span className="truncate block max-w-[80px] sm:max-w-none" title={employee.position}>
                          {employee.position}
                        </span>
                      </td>
                      <td className="text-xs">{employee.department || '-'}</td>
                      <td className="text-xs">{employee.phone || '-'}</td>
                      <td className="text-xs">{employee.email || '-'}</td>
                      <td>
                        {employee.isCaretaker ? (
                          <span className="badge badge-success text-[10px] px-1.5 py-0.5">Yes</span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-zinc-600">No</span>
                        )}
                      </td>
                      <td className="text-xs">
                        {employee.caretaker?.buildings && employee.caretaker.buildings.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {employee.caretaker.buildings.map((building: Building) => (
                              <span
                                key={building.id}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 rounded text-[10px]"
                                title={building.location}
                              >
                                <Building2 size={10} />
                                {building.name}
                              </span>
                            ))}
                          </div>
                        ) : employee.isCaretaker ? (
                          <span className="text-xs text-amber-600 dark:text-amber-400">No properties assigned</span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-zinc-600">-</span>
                        )}
                      </td>
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
                          {employee.salary_amount > 0 && (
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
                          )}
                          {caretaker && (
                            <button
                              onClick={() => handleResetPassword(caretaker)}
                              className="p-1 text-slate-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                              title="Reset Password"
                            >
                              <Key size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenModal(employee)}
                            className="p-1 text-slate-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                            title="Edit"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete ${employee.name}?${caretaker ? ' This will also delete their caretaker account.' : ''}`)) {
                                deleteMutation.mutate(employee.id)
                                if (caretaker) {
                                  deleteCaretakerMutation.mutate(caretaker)
                                }
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <Briefcase className="mx-auto text-slate-400 dark:text-zinc-600 mb-4" size={48} />
          <p className="text-slate-600 dark:text-zinc-400 mb-4">No employees added yet</p>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mb-4">
            Add employees and optionally grant them caretaker portal access for inventory and tenant management
          </p>
          <button onClick={() => handleOpenModal()} className="btn btn-primary">
            <Plus size={20} className="mr-2" />
            Add First Employee
          </button>
        </div>
      )}

      {/* Employee Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => {
          if (!newCaretakerCredentials) {
            setIsModalOpen(false)
            setEditingEmployee(null)
            setNewCaretakerCredentials(null)
            setError(null)
            resetForm()
          }
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

                {!editingEmployee && (
                  <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createCaretakerAccount}
                        onChange={(e) => {
                          setCreateCaretakerAccount(e.target.checked)
                          if (!e.target.checked) {
                            setSelectedBuildings([])
                          }
                        }}
                        className="mt-1 w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                      />
                      <div>
                        <div className="font-semibold text-sm text-slate-900 dark:text-zinc-100 mb-1">
                          Grant Portal Access (Caretaker)
                        </div>
                        <p className="text-xs text-slate-600 dark:text-zinc-400">
                          Create a caretaker account with portal access for inventory and tenant management. 
                          Email is required and login credentials will be generated.
                        </p>
                      </div>
                    </label>
                    
                    {createCaretakerAccount && buildings && buildings.length > 0 && (
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                          Assign to Properties <span className="text-red-500">*</span>
                        </label>
                        <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-zinc-700 rounded-lg p-3 space-y-2 bg-white dark:bg-zinc-900">
                          {buildings.map((building: Building) => (
                            <label key={building.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800 p-2 rounded">
                              <input
                                type="checkbox"
                                checked={selectedBuildings.includes(building.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedBuildings([...selectedBuildings, building.id])
                                  } else {
                                    setSelectedBuildings(selectedBuildings.filter(id => id !== building.id))
                                  }
                                }}
                                className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                              />
                              <div>
                                <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">{building.name}</div>
                                <div className="text-xs text-slate-500 dark:text-zinc-400">{building.location}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">
                          Select properties this caretaker will manage. They will only see data for assigned properties.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Show building assignments for existing caretakers */}
                {editingEmployee && (editingEmployee as UnifiedEmployee).caretaker && buildings && buildings.length > 0 && (
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                      Assigned Properties
                    </label>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-zinc-700 rounded-lg p-3 space-y-2 bg-white dark:bg-zinc-900">
                      {buildings.map((building: Building) => (
                        <label key={building.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={selectedBuildings.includes(building.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBuildings([...selectedBuildings, building.id])
                              } else {
                                setSelectedBuildings(selectedBuildings.filter(id => id !== building.id))
                              }
                            }}
                            className="w-4 h-4 text-primary-600 border-slate-300 rounded focus:ring-primary-500"
                          />
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-zinc-100">{building.name}</div>
                            <div className="text-xs text-slate-500 dark:text-zinc-400">{building.location}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">
                      Update property assignments for this caretaker.
                    </p>
                  </div>
                )}

                {/* Show caretaker credentials if just created */}
                {newCaretakerCredentials && (
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                      <Check size={18} />
                      <span className="font-semibold text-sm">Caretaker Account Created Successfully</span>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                        Email
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCaretakerCredentials.email}
                          readOnly
                          className="input flex-1 bg-slate-50 dark:bg-zinc-900"
                        />
                        <button
                          onClick={() => copyToClipboard(newCaretakerCredentials.email, 'email')}
                          className="btn btn-secondary"
                          title="Copy email"
                        >
                          {copiedField === 'email' ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                        Password
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCaretakerCredentials.password}
                          readOnly
                          className="input flex-1 bg-slate-50 dark:bg-zinc-900 font-mono"
                        />
                        <button
                          onClick={() => copyToClipboard(newCaretakerCredentials.password, 'password')}
                          className="btn btn-secondary"
                          title="Copy password"
                        >
                          {copiedField === 'password' ? <Check size={18} /> : <Copy size={18} />}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">
                        Save these credentials now. They will not be shown again. The caretaker can use these to login immediately.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false)
                      setEditingEmployee(null)
                      setNewCaretakerCredentials(null)
                      setError(null)
                      resetForm()
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    {newCaretakerCredentials ? 'Done' : 'Cancel'}
                  </button>
                  {!newCaretakerCredentials && (
                    <button
                      type="submit"
                      className="flex-1 btn btn-primary"
                      disabled={createMutation.isPending || updateMutation.isPending || createCaretakerMutation.isPending}
                    >
                      {createMutation.isPending || updateMutation.isPending || createCaretakerMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          {createCaretakerMutation.isPending ? 'Creating...' : 'Saving...'}
                        </>
                      ) : (
                        <>
                          {editingEmployee ? 'Update' : 'Create'} Employee
                        </>
                      )}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Salary Management Modal */}
      {showSalaryModal && selectedEmployee && (
        <SalaryManagement
          employee={selectedEmployee}
          onClose={() => {
            setShowSalaryModal(false)
            setSelectedEmployee(null)
          }}
        />
      )}

      {/* Credentials Modal for Password Reset */}
      {showCredentialsModal && newCaretakerCredentials && (
        <div className="modal-overlay" onClick={() => {
          setShowCredentialsModal(false)
          setNewCaretakerCredentials(null)
        }}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                Password Reset Successful
              </h2>
              <p className="text-slate-600 dark:text-zinc-400 mb-6">
                Save these credentials. They will not be shown again.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Email
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCaretakerCredentials.email}
                      readOnly
                      className="input flex-1 bg-slate-50 dark:bg-zinc-900"
                    />
                    <button
                      onClick={() => copyToClipboard(newCaretakerCredentials.email, 'email')}
                      className="btn btn-secondary"
                      title="Copy email"
                    >
                      {copiedField === 'email' ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    New Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCaretakerCredentials.password}
                      readOnly
                      className="input flex-1 bg-slate-50 dark:bg-zinc-900 font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(newCaretakerCredentials.password, 'password')}
                      className="btn btn-secondary"
                      title="Copy password"
                    >
                      {copiedField === 'password' ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-500 mt-2">
                    Save this new password now. It will not be shown again. The caretaker can use this password to login immediately.
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    onClick={() => {
                      setShowCredentialsModal(false)
                      setNewCaretakerCredentials(null)
                    }}
                    className="flex-1 btn btn-primary"
                  >
                    Done
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

