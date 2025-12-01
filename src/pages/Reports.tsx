import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileSpreadsheet } from 'lucide-react'
import { exportToExcel } from '@/lib/excel'

export default function Reports() {
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0]
  )
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [reportType, setReportType] = useState<'revenue' | 'arrears' | 'occupancy'>('revenue')

  const { data: revenueData } = useQuery({
    queryKey: ['revenue-report', startDate, endDate],
    queryFn: async () => {
      const { data } = await supabase
        .from('payments')
        .select('*, bills(billing_month), units(unit_number, buildings(name)), tenants(name)')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate)
        .order('payment_date', { ascending: false })
      
      const total = data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
      return { payments: data || [], total }
    },
    enabled: reportType === 'revenue',
  })

  const { data: arrearsData } = useQuery({
    queryKey: ['arrears-report'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bills')
        .select('*, units(unit_number, buildings(name)), tenants(name, phone)')
        .gt('balance', 0)
        .order('balance', { ascending: false })
      
      const total = data?.reduce((sum, b) => sum + (b.balance || 0), 0) || 0
      
      // Categorize by age
      const now = new Date()
      const aging = {
        current: [] as any[],
        '30days': [] as any[],
        '60days': [] as any[],
        '90days': [] as any[],
      }

      data?.forEach((bill) => {
        const billDate = new Date(bill.created_at)
        const daysPast = Math.floor((now.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysPast <= 30) aging.current.push(bill)
        else if (daysPast <= 60) aging['30days'].push(bill)
        else if (daysPast <= 90) aging['60days'].push(bill)
        else aging['90days'].push(bill)
      })

      return { bills: data || [], total, aging }
    },
    enabled: reportType === 'arrears',
  })

  const { data: occupancyData } = useQuery({
    queryKey: ['occupancy-report'],
    queryFn: async () => {
      const { data } = await supabase
        .from('units')
        .select('*, buildings(name), tenants(name)')
        .order('unit_number')
      
      const occupied = data?.filter((u) => u.status === 'occupied').length || 0
      const vacant = data?.filter((u) => u.status === 'vacant').length || 0
      const total = data?.length || 0
      const occupancyRate = total > 0 ? ((occupied / total) * 100).toFixed(1) : '0'

      return { units: data || [], occupied, vacant, total, occupancyRate }
    },
    enabled: reportType === 'occupancy',
  })

  const handleExportExcel = () => {
    if (reportType === 'revenue' && revenueData) {
      exportToExcel(
        revenueData.payments.map((p: any) => ({
          Date: formatDate(p.payment_date),
          Tenant: p.tenants?.name || 'N/A',
          Unit: p.units?.unit_number || 'N/A',
          Amount: p.amount,
          Method: p.payment_method,
        })),
        'revenue-report'
      )
    } else if (reportType === 'arrears' && arrearsData) {
      exportToExcel(
        arrearsData.bills.map((b: any) => ({
          'Billing Month': b.billing_month,
          Tenant: b.tenants?.name || 'N/A',
          Unit: b.units?.unit_number || 'N/A',
          'Total Amount': b.total_amount,
          'Amount Paid': b.amount_paid,
          Balance: b.balance,
        })),
        'arrears-report'
      )
    } else if (reportType === 'occupancy' && occupancyData) {
      exportToExcel(
        occupancyData.units.map((u: any) => ({
          'Unit Number': u.unit_number,
          Building: u.buildings?.name || 'N/A',
          Status: u.status,
          Tenant: u.tenants?.name || 'Vacant',
          'Monthly Rent': u.monthly_rent,
        })),
        'occupancy-report'
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <div className="flex gap-3">
          <button
            onClick={handleExportExcel}
            className="btn btn-primary flex items-center gap-2"
          >
            <FileSpreadsheet size={20} />
            Export to Excel
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setReportType('revenue')}
            className={`btn ${reportType === 'revenue' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Revenue Report
          </button>
          <button
            onClick={() => setReportType('arrears')}
            className={`btn ${reportType === 'arrears' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Arrears Report
          </button>
          <button
            onClick={() => setReportType('occupancy')}
            className={`btn ${reportType === 'occupancy' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Occupancy Report
          </button>
        </div>

        {reportType === 'revenue' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800 mb-1">Total Revenue</p>
              <p className="text-3xl font-bold text-green-900">
                {formatCurrency(revenueData?.total || 0)}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tenant</th>
                    <th>Unit</th>
                    <th>Amount</th>
                    <th>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData?.payments.map((payment: any) => (
                    <tr key={payment.id}>
                      <td>{formatDate(payment.payment_date)}</td>
                      <td>{payment.tenants?.name || 'N/A'}</td>
                      <td>
                        {payment.units?.unit_number} ({payment.units?.buildings?.name})
                      </td>
                      <td className="font-semibold">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td>
                        <span className="badge badge-info capitalize">
                          {payment.payment_method}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportType === 'arrears' && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 mb-1">Total Outstanding</p>
              <p className="text-3xl font-bold text-red-900">
                {formatCurrency(arrearsData?.total || 0)}
              </p>
            </div>

            {arrearsData && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">Current</p>
                  <p className="text-xl font-bold">
                    {arrearsData.aging.current.length}
                  </p>
                </div>
                <div className="p-4 bg-yellow-50 rounded-lg">
                  <p className="text-sm text-gray-600">1-30 Days</p>
                  <p className="text-xl font-bold">
                    {arrearsData.aging['30days'].length}
                  </p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-gray-600">31-60 Days</p>
                  <p className="text-xl font-bold">
                    {arrearsData.aging['60days'].length}
                  </p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-gray-600">60+ Days</p>
                  <p className="text-xl font-bold">
                    {arrearsData.aging['90days'].length}
                  </p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Billing Month</th>
                    <th>Tenant</th>
                    <th>Unit</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {arrearsData?.bills.map((bill: any) => (
                    <tr key={bill.id}>
                      <td>{bill.billing_month}</td>
                      <td>{bill.tenants?.name || 'N/A'}</td>
                      <td>
                        {bill.units?.unit_number} ({bill.units?.buildings?.name})
                      </td>
                      <td>{formatCurrency(bill.total_amount)}</td>
                      <td className="text-green-600">
                        {formatCurrency(bill.amount_paid)}
                      </td>
                      <td className="font-semibold text-red-600">
                        {formatCurrency(bill.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportType === 'occupancy' && occupancyData && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600">Total Units</p>
                <p className="text-3xl font-bold">{occupancyData.total}</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600">Occupied</p>
                <p className="text-3xl font-bold text-green-600">
                  {occupancyData.occupied}
                </p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Occupancy Rate</p>
                <p className="text-3xl font-bold">{occupancyData.occupancyRate}%</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Unit Number</th>
                    <th>Building</th>
                    <th>Status</th>
                    <th>Tenant</th>
                    <th>Monthly Rent</th>
                  </tr>
                </thead>
                <tbody>
                  {occupancyData.units.map((unit: any) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

