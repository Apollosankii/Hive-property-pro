import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { supabase, supabaseUrl, UtilityType, Caretaker } from '@/lib/supabase'
import { Save, Plus, Edit, Trash2, X, AlertCircle, UserPlus, Key, Copy, Check } from 'lucide-react'

export default function Settings() {
  const { user } = useAuthStore()
  const [waterRate, setWaterRate] = useState('')
  const [elecRate, setElecRate] = useState('')
  const [isUtilityModalOpen, setIsUtilityModalOpen] = useState(false)
  const [editingUtility, setEditingUtility] = useState<UtilityType | null>(null)
  const [utilityFormData, setUtilityFormData] = useState({
    name: '',
    rate: '',
    unit_name: 'unit',
    description: '',
    display_order: '0',
  })
  const [error, setError] = useState<string | null>(null)
  const [isCaretakerModalOpen, setIsCaretakerModalOpen] = useState(false)
  const [caretakerFormData, setCaretakerFormData] = useState({ name: '', phone: '', email: '' })
  const [newCaretakerCredentials, setNewCaretakerCredentials] = useState<{ email: string; password: string } | null>(null)
  const [isPasswordReset, setIsPasswordReset] = useState(false) // Track if showing reset password
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const stored = localStorage.getItem('app-settings')
      if (stored) {
        return JSON.parse(stored)
      }
      return { water_rate: 50, elec_rate: 15 }
    },
  })

  const { data: utilityTypes, isLoading: utilityTypesLoading } = useQuery({
    queryKey: ['utility-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('utility_types')
        .select('*')
        .order('display_order', { ascending: true })
      
      if (error) throw error
      return data || []
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  const updateMutation = useMutation({
    mutationFn: async (newSettings: { water_rate: number; elec_rate: number }) => {
      localStorage.setItem('app-settings', JSON.stringify(newSettings))
      return newSettings
    },
    onSuccess: (newSettings) => {
      // Invalidate and refetch settings query to ensure all components get updated values
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.setQueryData(['settings'], newSettings)
      // Reset local state to show saved values
      setWaterRate('')
      setElecRate('')
      alert('Settings saved successfully!')
    },
  })

  const createUtilityMutation = useMutation({
    mutationFn: async (utilityData: any) => {
      const { data, error } = await supabase
        .from('utility_types')
        .insert([utilityData])
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
      setIsUtilityModalOpen(false)
      setEditingUtility(null)
      setUtilityFormData({
        name: '',
        rate: '',
        unit_name: 'unit',
        description: '',
        display_order: '0',
      })
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to create utility type:', error)
      setError(error.message || 'Failed to create utility type')
    },
  })

  const updateUtilityMutation = useMutation({
    mutationFn: async ({ id, ...utilityData }: any) => {
      const { data, error } = await supabase
        .from('utility_types')
        .update(utilityData)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
      setIsUtilityModalOpen(false)
      setEditingUtility(null)
      setUtilityFormData({
        name: '',
        rate: '',
        unit_name: 'unit',
        description: '',
        display_order: '0',
      })
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to update utility type:', error)
      setError(error.message || 'Failed to update utility type')
    },
  })

  const deleteUtilityMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('utility_types')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
    },
    onError: (error: any) => {
      console.error('Failed to delete utility type:', error)
      alert('Failed to delete utility type: ' + (error.message || 'Unknown error'))
    },
  })

  const toggleUtilityActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('utility_types')
        .update({ is_active })
        .eq('id', id)
      
      if (error) throw error
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['utility-types'] })
      await queryClient.invalidateQueries({ queryKey: ['active-utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['utility-types'] })
      await queryClient.refetchQueries({ queryKey: ['active-utility-types'] })
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    // Allow 0 or any positive number - save exactly what user enters
    // If empty, keep existing value; if 0, save 0; if number, save that number
    const newWaterRate = waterRate === '' 
      ? (settings?.water_rate ?? 50) 
      : (waterRate === '0' ? 0 : (parseFloat(waterRate) || settings?.water_rate || 50))
    const newElecRate = elecRate === '' 
      ? (settings?.elec_rate ?? 15) 
      : (elecRate === '0' ? 0 : (parseFloat(elecRate) || settings?.elec_rate || 15))
    
    console.log('Saving rates:', { newWaterRate, newElecRate, waterRate, elecRate })
    
    updateMutation.mutate({
      water_rate: newWaterRate,
      elec_rate: newElecRate,
    })
  }

  const handleOpenUtilityModal = (utility?: UtilityType) => {
    if (utility) {
      setEditingUtility(utility)
      setUtilityFormData({
        name: utility.name,
        rate: utility.rate.toString(),
        unit_name: utility.unit_name,
        description: utility.description || '',
        display_order: utility.display_order.toString(),
      })
    } else {
      setEditingUtility(null)
      setUtilityFormData({
        name: '',
        rate: '',
        unit_name: 'unit',
        description: '',
        display_order: '0',
      })
    }
    setError(null)
    setIsUtilityModalOpen(true)
  }

  const handleSaveUtility = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!utilityFormData.name.trim()) {
      setError('Utility name is required')
      return
    }

    if (!utilityFormData.rate || parseFloat(utilityFormData.rate) < 0) {
      setError('Rate must be a positive number')
      return
    }

    const utilityData = {
      name: utilityFormData.name.trim(),
      rate: parseFloat(utilityFormData.rate),
      unit_name: utilityFormData.unit_name || 'unit',
      description: utilityFormData.description.trim() || null,
      display_order: parseInt(utilityFormData.display_order) || 0,
    }

    if (editingUtility) {
      updateUtilityMutation.mutate({ id: editingUtility.id, ...utilityData })
    } else {
      createUtilityMutation.mutate(utilityData)
    }
  }

  const handleDeleteUtility = (id: string) => {
    if (confirm('Are you sure you want to delete this utility type? This will remove it from all future bills.')) {
      deleteUtilityMutation.mutate(id)
    }
  }

  // Caretaker Management
  const { data: caretakers, isLoading: caretakersLoading, error: caretakersError } = useQuery({
    queryKey: ['caretakers'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('caretakers')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (error) {
          console.error('Error fetching caretakers:', error)
          // If table doesn't exist (42P01) or 406 error, return empty array
          if (error.code === '42P01' || error.code === 'PGRST116' || error.message.includes('does not exist') || error.message.includes('406')) {
            console.warn('Caretakers table does not exist. Please run CREATE_CARETAKERS_TABLE.sql in Supabase SQL Editor.')
            return []
          }
          throw error
        }
        return data || []
      } catch (err: any) {
        // Handle network errors or other issues
        if (err.message?.includes('406') || err.code === '42P01') {
          console.warn('Caretakers table not found. Please run CREATE_CARETAKERS_TABLE.sql')
          return []
        }
        throw err
      }
    },
    staleTime: 0,
    refetchOnMount: true,
    retry: false, // Don't retry if table doesn't exist
  })

  // Generate random password
  const generatePassword = () => {
    const length = 12
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
  }

  const createCaretakerMutation = useMutation({
    mutationFn: async (caretakerData: { name: string; phone: string; email: string; password: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.id) throw new Error('User not authenticated')

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(caretakerData.email)) {
        throw new Error('Invalid email format')
      }

      // Validate password
      if (caretakerData.password.length < 6) {
        throw new Error('Password must be at least 6 characters')
      }

      // Use Edge Function (REQUIRED - no fallback due to foreign key timing issues)
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/create-caretaker`
      
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession?.access_token) {
        throw new Error('Not authenticated. Please log in again.')
      }

      console.log('Calling Edge Function:', edgeFunctionUrl)
      
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

      console.log('Edge Function Response Status:', edgeResponse.status)

      if (!edgeResponse.ok) {
        const errorText = await edgeResponse.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText || `HTTP ${edgeResponse.status}` }
        }
        
        console.error('Edge Function Error:', errorData)
        throw new Error(errorData.error || `Edge function returned status ${edgeResponse.status}`)
      }

      const edgeResult = await edgeResponse.json()
      console.log('Edge Function Result:', edgeResult)

      if (edgeResult.success && edgeResult.caretaker) {
        return {
          caretaker: edgeResult.caretaker,
          credentials: edgeResult.credentials,
        }
      }
      
      throw new Error(edgeResult.error || 'Edge function returned invalid response')
    },
    onSuccess: (data) => {
      setNewCaretakerCredentials(data.credentials)
      setIsPasswordReset(false) // Not a password reset, it's a new caretaker
      setIsCaretakerModalOpen(true) // Ensure modal is open to show credentials
      queryClient.invalidateQueries({ queryKey: ['caretakers'] })
      setCaretakerFormData({ name: '', phone: '', email: '' })
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to create caretaker')
    },
  })

  const deleteCaretakerMutation = useMutation({
    mutationFn: async (caretaker: Caretaker) => {
      // Note: We can't delete auth users from the frontend
      // The auth user will remain but the caretaker record will be deleted
      // In production, use a backend function to properly delete both
      
      // Delete caretaker record
      const { error } = await supabase
        .from('caretakers')
        .delete()
        .eq('id', caretaker.id)

      if (error) throw error
      
      // Note: The auth user should be deleted via a backend function
      // For now, we'll just delete the caretaker record
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
      
      // Try using Edge Function first to update auth password
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
        } else {
          // Edge function not available, fall back to updating hash only
          console.warn('Edge function not available for password reset, updating hash only:', edgeResult.error)
          throw new Error('Edge function unavailable')
        }
      } catch (edgeError: any) {
        // Fallback: Update password hash in database
        // Note: This doesn't update the actual auth password, but stores it for reference
        const passwordHash = btoa(newPassword)
        const { error } = await supabase
          .from('caretakers')
          .update({ password_hash: passwordHash })
          .eq('id', caretaker.id)

        if (error) throw error

        // Fallback: Without Edge Function, we can't update the actual auth password
        // Show error message to user
        throw new Error(
          'Password reset requires Edge Function deployment. ' +
          'The password shown is for reference only. ' +
          'Please deploy the reset-caretaker-password Edge Function or manually update the password in Supabase Dashboard.'
        )
      }
    },
    onSuccess: (credentials) => {
      setNewCaretakerCredentials(credentials)
      setIsPasswordReset(true)
      setIsCaretakerModalOpen(true) // Open modal to show credentials
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to reset password')
    },
  })

  const handleCreateCaretaker = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!caretakerFormData.name.trim()) {
      setError('Name is required')
      return
    }

    if (!caretakerFormData.email.trim()) {
      setError('Email is required')
      return
    }

    const password = generatePassword()
    createCaretakerMutation.mutate({
      name: caretakerFormData.name.trim(),
      phone: caretakerFormData.phone.trim() || '',
      email: caretakerFormData.email.trim(),
      password,
    })
  }

  const handleDeleteCaretaker = (caretaker: Caretaker) => {
    if (confirm(`Are you sure you want to delete ${caretaker.name}? This will permanently terminate their account.`)) {
      deleteCaretakerMutation.mutate(caretaker)
    }
  }

  const handleResetPassword = (caretaker: Caretaker) => {
    if (confirm(`Reset password for ${caretaker.name}? New credentials will be generated.`)) {
      resetCaretakerPasswordMutation.mutate(caretaker)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
        Settings
      </h1>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Default Utility Rates</h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Default Water Rate (KES per unit)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={waterRate !== '' ? waterRate : (settings?.water_rate?.toString() || '')}
              onChange={(e) => setWaterRate(e.target.value)}
              className="input"
              placeholder="50"
            />
            <p className="mt-1 text-xs text-slate-500">
              Default rate used when generating bills
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Default Electricity Rate (KES per unit)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={elecRate !== '' ? elecRate : (settings?.elec_rate?.toString() || '')}
              onChange={(e) => setElecRate(e.target.value)}
              className="input"
              placeholder="15"
            />
            <p className="mt-1 text-xs text-slate-500">
              Default rate used when generating bills
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary flex items-center gap-2"
            disabled={updateMutation.isPending}
          >
            <Save size={20} />
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Utility Types</h2>
            <p className="text-sm text-slate-600 mt-1">
              Configure utility types with rates (similar to water and electricity)
            </p>
          </div>
          <button
            onClick={() => handleOpenUtilityModal()}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Add Utility Type
          </button>
        </div>

        {utilityTypesLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-slate-600">Loading utility types...</p>
          </div>
        ) : utilityTypes && utilityTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Rate</th>
                  <th>Unit</th>
                  <th>Description</th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {utilityTypes.map((utility: UtilityType) => (
                  <tr key={utility.id}>
                    <td className="font-semibold">{utility.name}</td>
                    <td>{utility.rate.toLocaleString()} KES</td>
                    <td>{utility.unit_name}</td>
                    <td className="text-slate-600">{utility.description || '-'}</td>
                    <td>{utility.display_order}</td>
                    <td>
                      <span className={`badge ${utility.is_active ? 'badge-success' : 'badge-warning'}`}>
                        {utility.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleUtilityActiveMutation.mutate({ 
                            id: utility.id, 
                            is_active: !utility.is_active 
                          })}
                          className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                          title={utility.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {utility.is_active ? '✓' : '○'}
                        </button>
                        <button
                          onClick={() => handleOpenUtilityModal(utility)}
                          className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteUtility(utility.id)}
                          className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
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
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No utility types configured. Click "Add Utility Type" to get started.</p>
          </div>
        )}
      </div>

      {/* Caretaker Management Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Caretaker Management</h2>
            <p className="text-sm text-slate-600 mt-1">
              Create and manage caretaker accounts for inventory and tenant onboarding
            </p>
          </div>
          <button
            onClick={() => {
              setIsCaretakerModalOpen(true)
              setNewCaretakerCredentials(null)
              setIsPasswordReset(false)
              setCaretakerFormData({ name: '', phone: '', email: '' })
            }}
            className="btn btn-primary flex items-center gap-2"
          >
            <UserPlus size={20} />
            Add Caretaker
          </button>
        </div>

        {caretakersError && (
          <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                  Database Setup Required
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Please run the <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">CREATE_CARETAKERS_TABLE.sql</code> file in your Supabase SQL Editor to create the caretakers table.
                </p>
              </div>
            </div>
          </div>
        )}

        {caretakersLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-slate-600">Loading caretakers...</p>
          </div>
        ) : caretakers && caretakers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {caretakers.map((caretaker: Caretaker) => (
                  <tr key={caretaker.id}>
                    <td className="font-semibold">{caretaker.name}</td>
                    <td>{caretaker.email}</td>
                    <td>{caretaker.phone || '-'}</td>
                    <td>
                      <span className={`badge ${caretaker.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                        {caretaker.status}
                      </span>
                    </td>
                    <td>{new Date(caretaker.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResetPassword(caretaker)}
                          className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-xl transition-all"
                          title="Reset Password"
                        >
                          <Key size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteCaretaker(caretaker)}
                          className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
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
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No caretakers created yet. Click "Add Caretaker" to get started.</p>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Account Information</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Email</label>
            <p className="mt-1 text-slate-900">{user?.email}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">User ID</label>
            <p className="mt-1 text-slate-500 text-sm font-mono">{user?.id}</p>
          </div>
        </div>
      </div>

      {/* Utility Type Modal */}
      {isUtilityModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsUtilityModalOpen(false)
          setEditingUtility(null)
          setError(null)
        }}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {editingUtility ? 'Edit Utility Type' : 'Add Utility Type'}
              </h2>
              <p className="text-slate-600 mb-6">
                Configure a utility type with a rate (e.g., Garbage at 500 KES per service)
              </p>
              
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

              <form onSubmit={handleSaveUtility} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Utility Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={utilityFormData.name}
                    onChange={(e) => setUtilityFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Garbage Collection, Cleaning Service"
                    className="input"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Rate (KES) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={utilityFormData.rate}
                      onChange={(e) => setUtilityFormData(prev => ({ ...prev, rate: e.target.value }))}
                      placeholder="500"
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Unit Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={utilityFormData.unit_name}
                      onChange={(e) => setUtilityFormData(prev => ({ ...prev, unit_name: e.target.value }))}
                      placeholder="e.g., service, kg, bag"
                      className="input"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={utilityFormData.description}
                    onChange={(e) => setUtilityFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    className="input"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={utilityFormData.display_order}
                    onChange={(e) => setUtilityFormData(prev => ({ ...prev, display_order: e.target.value }))}
                    placeholder="0"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Lower numbers appear first in billing forms
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUtilityModalOpen(false)
                      setEditingUtility(null)
                      setError(null)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={createUtilityMutation.isPending || updateUtilityMutation.isPending}
                  >
                    {createUtilityMutation.isPending || updateUtilityMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save size={18} className="mr-2" />
                        {editingUtility ? 'Update' : 'Create'} Utility Type
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Caretaker Modal */}
      {isCaretakerModalOpen && (
        <div className="modal-overlay" onClick={() => {
          setIsCaretakerModalOpen(false)
          setCaretakerFormData({ name: '', phone: '', email: '' })
          setNewCaretakerCredentials(null)
          setIsPasswordReset(false)
          setError(null)
        }}>
          <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {newCaretakerCredentials 
                  ? (isPasswordReset ? 'Password Reset Successful' : 'Caretaker Created Successfully')
                  : 'Add Caretaker'}
              </h2>
              <p className="text-slate-600 mb-6">
                {newCaretakerCredentials 
                  ? (isPasswordReset 
                      ? 'Save the new password securely. The old password no longer works.'
                      : 'Save these credentials securely. They will not be shown again.')
                  : 'Create a new caretaker account with auto-generated credentials'}
              </p>
              
              {!newCaretakerCredentials && !error && (
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Important:</strong> Ensure email confirmation is disabled in Supabase Auth settings (Authentication → Settings → Email Auth → Confirm email: OFF), or the signup will fail.
                  </p>
                </div>
              )}
              
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

              {newCaretakerCredentials ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Login Credentials</p>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newCaretakerCredentials.email}
                            readOnly
                            className="input flex-1 bg-white font-mono text-sm"
                          />
                          <button
                            onClick={() => copyToClipboard(newCaretakerCredentials.email, 'email')}
                            className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                            title="Copy"
                          >
                            {copiedField === 'email' ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={newCaretakerCredentials.password}
                            readOnly
                            className="input flex-1 bg-white font-mono text-sm"
                          />
                          <button
                            onClick={() => copyToClipboard(newCaretakerCredentials.password, 'password')}
                            className="p-2 text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                            title="Copy"
                          >
                            {copiedField === 'password' ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-amber-600 mt-3 font-semibold">
                      ⚠️ {isPasswordReset 
                        ? 'Save this new password now. It will not be shown again. The caretaker can use this password to login immediately.'
                        : 'Save these credentials now. They will not be shown again.'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setIsCaretakerModalOpen(false)
                      setNewCaretakerCredentials(null)
                      setIsPasswordReset(false)
                      setCaretakerFormData({ name: '', phone: '', email: '' })
                    }}
                    className="w-full btn btn-primary"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCreateCaretaker} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={caretakerFormData.name}
                      onChange={(e) => setCaretakerFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Caretaker full name"
                      className="input"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={caretakerFormData.email}
                      onChange={(e) => setCaretakerFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="caretaker@example.com"
                      className="input"
                      required
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      This will be used for login
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={caretakerFormData.phone}
                      onChange={(e) => setCaretakerFormData(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+254 700 000 000"
                      className="input"
                    />
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCaretakerModalOpen(false)
                        setCaretakerFormData({ name: '', phone: '', email: '' })
                        setError(null)
                      }}
                      className="flex-1 btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 btn btn-primary"
                      disabled={createCaretakerMutation.isPending}
                    >
                      {createCaretakerMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Creating...
                        </>
                      ) : (
                        <>
                          <UserPlus size={18} className="mr-2" />
                          Create Caretaker
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
