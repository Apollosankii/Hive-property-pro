import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatMonth } from '@/lib/utils'
import { Plus, Calendar, CheckCircle } from 'lucide-react'

export default function Billing() {
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [showMeterModal, setShowMeterModal] = useState(false)
  const [meterReadings, setMeterReadings] = useState<Record<string, {
    water_prev: number
    water_current: number
    elec_prev: number
    elec_current: number
  }>>({})
  const queryClient = useQueryClient()

  const { data: bills } = useQuery({
    queryKey: ['bills', selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select('*, units(unit_number, buildings(name)), tenants(name)')
        .eq('billing_month', selectedMonth)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },
  })

  const { data: occupiedUnits } = useQuery({
    queryKey: ['occupied-units'],
    queryFn: async () => {
      const { data } = await supabase
        .from('units')
        .select('id, unit_number, monthly_rent, buildings(name), tenants(id, name)')
        .eq('status', 'occupied')
        .order('unit_number')
      return data || []
    },
  })

  const generateBillsMutation = useMutation({
    mutationFn: async () => {
      if (!occupiedUnits) return

      // Get previous month's bills for arrears
      const prevMonth = new Date(selectedMonth + '-01')
      prevMonth.setMonth(prevMonth.getMonth() - 1)
      const prevMonthStr = prevMonth.toISOString().slice(0, 7)

      const { data: prevBills } = await supabase
        .from('bills')
        .select('unit_id, balance')
        .eq('billing_month', prevMonthStr)

      const prevBalances = new Map(
        prevBills?.map((b) => [b.unit_id, b.balance || 0]) || []
      )

      // Get previous month's meter readings
      const { data: prevMonthBills } = await supabase
        .from('bills')
        .select('unit_id, water_current_reading, elec_current_reading')
        .eq('billing_month', prevMonthStr)

      const prevMeterReadings = new Map(
        prevMonthBills?.map((b) => [
          b.unit_id,
          {
            water: b.water_current_reading || 0,
            elec: b.elec_current_reading || 0,
          },
        ]) || []
      )

      // Default rates (can be moved to settings)
      const defaultWaterRate = 50
      const defaultElecRate = 15

      const billsToInsert = occupiedUnits.map((unit: any) => {
        const readings = meterReadings[unit.id] || {
          water_prev: prevMeterReadings.get(unit.id)?.water || 0,
          water_current: prevMeterReadings.get(unit.id)?.water || 0,
          elec_prev: prevMeterReadings.get(unit.id)?.elec || 0,
          elec_current: prevMeterReadings.get(unit.id)?.elec || 0,
        }

        const waterUnits = Math.max(0, readings.water_current - readings.water_prev)
        const elecUnits = Math.max(0, readings.elec_current - readings.elec_prev)

        const waterAmount = waterUnits * defaultWaterRate
        const elecAmount = elecUnits * defaultElecRate
        const arrears = prevBalances.get(unit.id) || 0
        const total = waterAmount + elecAmount + (unit.monthly_rent || 0) + arrears

        return {
          unit_id: unit.id,
          tenant_id: unit.tenants?.id || null,
          billing_month: selectedMonth,
          water_prev_reading: readings.water_prev,
          water_current_reading: readings.water_current,
          water_units_consumed: waterUnits,
          water_rate: defaultWaterRate,
          water_amount: waterAmount,
          elec_prev_reading: readings.elec_prev,
          elec_current_reading: readings.elec_current,
          elec_units_consumed: elecUnits,
          elec_rate: defaultElecRate,
          elec_amount: elecAmount,
          rent_amount: unit.monthly_rent || 0,
          arrears_brought_forward: arrears,
          total_amount: total,
          amount_paid: 0,
          balance: total,
          status: 'pending' as const,
        }
      })

      const { error } = await supabase.from('bills').insert(billsToInsert)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      setIsGenerating(false)
      setShowMeterModal(false)
      setMeterReadings({})
    },
  })

  const handleGenerateBills = () => {
    if (!occupiedUnits || occupiedUnits.length === 0) {
      alert('No occupied units found')
      return
    }
    setShowMeterModal(true)
  }

  const handleGenerate = () => {
    setIsGenerating(true)
    generateBillsMutation.mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Monthly Billing</h1>
        <div className="flex gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="text-gray-600" size={20} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input"
            />
          </div>
          <button
            onClick={handleGenerateBills}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Generate Bills
          </button>
        </div>
      </div>

      {bills && bills.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Tenant</th>
                <th>Water</th>
                <th>Electricity</th>
                <th>Rent</th>
                <th>Arrears</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill: any) => (
                <tr key={bill.id}>
                  <td className="font-medium">
                    {bill.units?.unit_number} ({bill.units?.buildings?.name})
                  </td>
                  <td>{bill.tenants?.name || 'N/A'}</td>
                  <td>{formatCurrency(bill.water_amount)}</td>
                  <td>{formatCurrency(bill.elec_amount)}</td>
                  <td>{formatCurrency(bill.rent_amount)}</td>
                  <td className="text-orange-600">
                    {formatCurrency(bill.arrears_brought_forward)}
                  </td>
                  <td className="font-semibold">
                    {formatCurrency(bill.total_amount)}
                  </td>
                  <td className="text-green-600">
                    {formatCurrency(bill.amount_paid)}
                  </td>
                  <td
                    className={`font-semibold ${
                      bill.balance > 0 ? 'text-red-600' : 'text-green-600'
                    }`}
                  >
                    {formatCurrency(bill.balance)}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        bill.status === 'paid'
                          ? 'badge-success'
                          : bill.status === 'partial'
                          ? 'badge-warning'
                          : 'badge-danger'
                      }`}
                    >
                      {bill.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">
            No bills found for {formatMonth(selectedMonth)}
          </p>
          <button onClick={handleGenerateBills} className="btn btn-primary">
            Generate Bills for This Month
          </button>
        </div>
      )}

      {showMeterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Enter Meter Readings</h2>
            <p className="text-gray-600 mb-6">
              Enter current meter readings for all units. Previous readings will be auto-filled where available.
            </p>
            
            <div className="space-y-4 mb-6">
              {occupiedUnits?.map((unit: any) => {
                const readings = meterReadings[unit.id] || {
                  water_prev: 0,
                  water_current: 0,
                  elec_prev: 0,
                  elec_current: 0,
                }
                
                return (
                  <div key={unit.id} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-3">
                      {unit.unit_number} - {unit.buildings?.name}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Water Prev</label>
                        <input
                          type="number"
                          value={readings.water_prev}
                          onChange={(e) =>
                            setMeterReadings({
                              ...meterReadings,
                              [unit.id]: {
                                ...readings,
                                water_prev: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          className="input text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Water Current</label>
                        <input
                          type="number"
                          value={readings.water_current}
                          onChange={(e) =>
                            setMeterReadings({
                              ...meterReadings,
                              [unit.id]: {
                                ...readings,
                                water_current: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          className="input text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Elec Prev</label>
                        <input
                          type="number"
                          value={readings.elec_prev}
                          onChange={(e) =>
                            setMeterReadings({
                              ...meterReadings,
                              [unit.id]: {
                                ...readings,
                                elec_prev: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          className="input text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Elec Current</label>
                        <input
                          type="number"
                          value={readings.elec_current}
                          onChange={(e) =>
                            setMeterReadings({
                              ...meterReadings,
                              [unit.id]: {
                                ...readings,
                                elec_current: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          className="input text-sm"
                          required
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={() => {
                  setShowMeterModal(false)
                  setMeterReadings({})
                }}
                className="flex-1 btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex-1 btn btn-primary flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <CheckCircle size={20} />
                    Generate Bills
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

