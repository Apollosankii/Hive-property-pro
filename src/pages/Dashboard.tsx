import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Users, DollarSign, AlertCircle, Home } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [tenantsRes, billsRes, unitsRes] = await Promise.all([
        supabase.from('tenants').select('id, status').eq('status', 'active'),
        supabase.from('bills').select('total_amount, amount_paid, balance, status'),
        supabase.from('units').select('id, status'),
      ])

      const tenants = tenantsRes.data || []
      const bills = billsRes.data || []
      const units = unitsRes.data || []

      const totalCollected = bills.reduce((sum, b) => sum + (b.amount_paid || 0), 0)
      const unpaidInvoices = bills.filter((b) => b.status !== 'paid').length
      const overdue = bills.filter((b) => b.balance > 0 && b.status !== 'paid').length
      const totalOutstanding = bills.reduce((sum, b) => sum + (b.balance || 0), 0)

      return {
        totalTenants: tenants.length,
        totalCollected,
        unpaidInvoices,
        overdue,
        totalOutstanding,
        occupiedUnits: units.filter((u) => u.status === 'occupied').length,
        vacantUnits: units.filter((u) => u.status === 'vacant').length,
      }
    },
  })

  const { data: recentPayments } = useQuery({
    queryKey: ['recent-payments'],
    queryFn: async () => {
      const { data } = await supabase
        .from('payments')
        .select('*, tenants(name), units(unit_number), buildings(name)')
        .order('created_at', { ascending: false })
        .limit(10)
      return data
    },
  })

  const statCards = [
    {
      title: 'Total Tenants',
      value: stats?.totalTenants || 0,
      icon: Users,
      color: 'bg-blue-500',
      link: '/tenants',
    },
    {
      title: 'Total Collected',
      value: formatCurrency(stats?.totalCollected || 0),
      icon: DollarSign,
      color: 'bg-green-500',
      link: '/payments',
    },
    {
      title: 'Unpaid Invoices',
      value: stats?.unpaidInvoices || 0,
      icon: AlertCircle,
      color: 'bg-yellow-500',
      link: '/billing',
    },
    {
      title: 'Overdue Accounts',
      value: stats?.overdue || 0,
      icon: AlertCircle,
      color: 'bg-red-500',
      link: '/reports',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex gap-3">
          <Link to="/billing" className="btn btn-primary">
            Generate Bills
          </Link>
          <Link to="/payments" className="btn btn-secondary">
            Record Payment
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Link
              key={stat.title}
              to={stat.link}
              className="card hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="text-white" size={24} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Home className="text-primary-600" size={20} />
            <h3 className="font-semibold">Units</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Occupied</span>
              <span className="font-semibold text-green-600">
                {stats?.occupiedUnits || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Vacant</span>
              <span className="font-semibold text-gray-600">
                {stats?.vacantUnits || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="text-primary-600" size={20} />
            <h3 className="font-semibold">Financial Summary</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Outstanding</span>
              <span className="font-semibold text-red-600">
                {formatCurrency(stats?.totalOutstanding || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Payments</h2>
        {recentPayments && recentPayments.length > 0 ? (
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
                {recentPayments.map((payment: any) => (
                  <tr key={payment.id}>
                    <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                    <td>{payment.tenants?.name || 'N/A'}</td>
                    <td>{payment.units?.unit_number || 'N/A'}</td>
                    <td className="font-semibold">{formatCurrency(payment.amount)}</td>
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
        ) : (
          <p className="text-gray-500 text-center py-8">No recent payments</p>
        )}
      </div>
    </div>
  )
}

