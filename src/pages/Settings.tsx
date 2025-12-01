import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { Save } from 'lucide-react'

export default function Settings() {
  const { user } = useAuthStore()
  const [waterRate, setWaterRate] = useState('')
  const [elecRate, setElecRate] = useState('')
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      // In a real app, you'd have a settings table
      // For now, we'll use local storage or defaults
      const stored = localStorage.getItem('app-settings')
      if (stored) {
        return JSON.parse(stored)
      }
      return { water_rate: 50, elec_rate: 15 }
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (newSettings: { water_rate: number; elec_rate: number }) => {
      localStorage.setItem('app-settings', JSON.stringify(newSettings))
      return newSettings
    },
    onSuccess: () => {
      queryClient.setQueryData(['settings'], (old: any) => ({
        ...old,
        water_rate: parseFloat(waterRate),
        elec_rate: parseFloat(elecRate),
      }))
      alert('Settings saved successfully!')
    },
  })

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      water_rate: parseFloat(waterRate) || 50,
      elec_rate: parseFloat(elecRate) || 15,
    })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900">Settings</h1>

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Utility Rates</h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Water Rate (KES per unit)
            </label>
            <input
              type="number"
              step="0.01"
              value={waterRate || settings?.water_rate || ''}
              onChange={(e) => setWaterRate(e.target.value)}
              className="input"
              placeholder="50"
            />
            <p className="mt-1 text-xs text-gray-500">
              Default rate used when generating bills
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Electricity Rate (KES per unit)
            </label>
            <input
              type="number"
              step="0.01"
              value={elecRate || settings?.elec_rate || ''}
              onChange={(e) => setElecRate(e.target.value)}
              className="input"
              placeholder="15"
            />
            <p className="mt-1 text-xs text-gray-500">
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
        <h2 className="text-xl font-bold text-gray-900 mb-4">Account Information</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-gray-900">{user?.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">User ID</label>
            <p className="mt-1 text-gray-500 text-sm font-mono">{user?.id}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

