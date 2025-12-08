import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Users, DollarSign, AlertCircle, Home, TrendingUp, ArrowRight, Calendar, Briefcase, Wallet, Package } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [tenantsRes, billsRes, unitsRes, paymentsRes, expensesRes, salariesRes, inventoryRes, employeesRes] = await Promise.all([
        supabase.from('tenants').select('id, status').eq('status', 'active'),
        supabase.from('bills').select('total_amount, amount_paid, balance, status'),
        supabase.from('units').select('id, status'),
        supabase.from('payments').select('amount'),
        supabase.from('expenses').select('amount'),
        supabase.from('salaries').select('total_amount, amount_paid'),
        supabase.from('inventory').select('total_value, status'),
        supabase.from('employees').select('id, status').eq('status', 'active'),
      ])

      if (tenantsRes.error) throw tenantsRes.error
      if (billsRes.error) throw billsRes.error
      if (unitsRes.error) throw unitsRes.error

      const tenants = tenantsRes.data || []
      const bills = billsRes.data || []
      const units = unitsRes.data || []
      const payments = paymentsRes.data || []
      const expenses = expensesRes.data || []
      const salaries = salariesRes.data || []
      const inventory = inventoryRes.data || []
      const employees = employeesRes.data || []

      const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
      const unpaidInvoices = bills.filter((b) => b.status !== 'paid').length
      const overdue = bills.filter((b) => b.balance > 0 && b.status !== 'paid').length
      const totalOutstanding = bills.reduce((sum, b) => sum + (b.balance || 0), 0)
      const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
      const totalSalaries = salaries.reduce((sum, s) => sum + (s.total_amount || 0), 0)
      const totalSalariesPaid = salaries.reduce((sum, s) => sum + (s.amount_paid || 0), 0)
      const inventoryValue = inventory.reduce((sum, i) => sum + (i.total_value || 0), 0)
      const lowStockItems = inventory.filter((i) => i.status === 'low_stock' || i.status === 'out_of_stock').length
      const netProfit = totalCollected - totalExpenses - totalSalariesPaid

      return {
        totalTenants: tenants.length,
        totalCollected,
        unpaidInvoices,
        overdue,
        totalOutstanding,
        occupiedUnits: units.filter((u) => u.status === 'occupied').length,
        vacantUnits: units.filter((u) => u.status === 'vacant').length,
        totalExpenses,
        totalSalaries,
        totalSalariesPaid,
        inventoryValue,
        lowStockItems,
        netProfit,
        totalEmployees: employees.length,
      }
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  const { data: recentPayments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['recent-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, tenants(name), units(unit_number), buildings(name)')
        .order('created_at', { ascending: false })
        .limit(10)
      
      if (error) throw error
      return data
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  const statCards = [
    {
      title: 'Total Tenants',
      value: stats?.totalTenants || 0,
      icon: Users,
      gradient: 'from-blue-500 to-blue-600',
      bgGradient: 'from-blue-50 to-blue-100/50',
      link: '/tenants',
    },
    {
      title: 'Total Collected',
      value: formatCurrency(stats?.totalCollected || 0),
      icon: DollarSign,
      gradient: 'from-emerald-500 to-emerald-600',
      bgGradient: 'from-emerald-50 to-emerald-100/50',
      link: '/payments',
    },
    {
      title: 'Unpaid Invoices',
      value: stats?.unpaidInvoices || 0,
      icon: AlertCircle,
      gradient: 'from-amber-500 to-amber-600',
      bgGradient: 'from-amber-50 to-amber-100/50',
      link: '/billing',
    },
    {
      title: 'Overdue Accounts',
      value: stats?.overdue || 0,
      icon: AlertCircle,
      gradient: 'from-red-500 to-red-600',
      bgGradient: 'from-red-50 to-red-100/50',
      link: '/reports',
    },
  ]

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-zinc-50 dark:to-zinc-200 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 mt-1">Welcome back! Here's what's happening today.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/billing" className="btn btn-primary">
            <Calendar size={18} className="text-current" />
            Generate Bills
          </Link>
          <Link to="/payments" className="btn btn-secondary">
            <DollarSign size={18} />
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
              className="stat-card group"
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg shadow-${stat.gradient.split('-')[1]}-500/20`}>
                    <Icon className="text-white" size={24} />
                  </div>
                  <ArrowRight 
                    size={18} 
                    className="text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors" 
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-zinc-400 mb-1">{stat.title}</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-zinc-50">{stat.value}</p>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Additional Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Link to="/employees" className="stat-card group">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/20">
                <Briefcase className="text-white" size={24} />
              </div>
              <ArrowRight size={18} className="text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400 mb-1">Active Employees</p>
              <p className="text-xl font-bold text-slate-900 dark:text-zinc-50">{stats?.totalEmployees || 0}</p>
            </div>
          </div>
        </Link>

        <Link to="/expenses" className="stat-card group">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20">
                <Wallet className="text-white" size={24} />
              </div>
              <ArrowRight size={18} className="text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400 mb-1">Total Expenses</p>
              <p className="text-xl font-bold text-slate-900 dark:text-zinc-50">{formatCurrency(stats?.totalExpenses || 0)}</p>
            </div>
          </div>
        </Link>

        <Link to="/inventory" className="stat-card group">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-lg shadow-indigo-500/20">
                <Package className="text-white" size={24} />
              </div>
              <ArrowRight size={18} className="text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400 mb-1">Inventory Value</p>
              <p className="text-xl font-bold text-slate-900 dark:text-zinc-50">{formatCurrency(stats?.inventoryValue || 0)}</p>
              {(stats?.lowStockItems || 0) > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{stats?.lowStockItems || 0} items need restocking</p>
              )}
            </div>
          </div>
        </Link>

        <Link to="/reports" className="stat-card group">
          <div className="relative z-10">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-xl bg-gradient-to-br ${(stats?.netProfit || 0) >= 0 ? 'from-emerald-500 to-emerald-600' : 'from-red-500 to-red-600'} shadow-lg`}>
                <TrendingUp className="text-white" size={24} />
              </div>
              <ArrowRight size={18} className="text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-colors" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-zinc-400 mb-1">Net Profit</p>
              <p className={`text-xl font-bold ${(stats?.netProfit || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatCurrency(stats?.netProfit || 0)}
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Additional Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card card-hover">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-primary-100 rounded-xl">
              <Home className="text-primary-600" size={20} />
            </div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-50">Unit Status</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-slate-700 dark:text-zinc-300 font-medium">Occupied</span>
              </div>
              <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg">
                {stats?.occupiedUnits || 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-slate-400 dark:bg-zinc-600 rounded-full"></div>
                <span className="text-slate-700 dark:text-zinc-300 font-medium">Vacant</span>
              </div>
              <span className="font-bold text-slate-700 dark:text-zinc-300 text-lg">
                {stats?.vacantUnits || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="card card-hover">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-primary-100 dark:bg-primary-900/30 rounded-xl">
              <TrendingUp className="text-primary-600 dark:text-primary-400" size={20} />
            </div>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-50">Financial Summary</h3>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-br from-emerald-50 dark:from-emerald-950/40 to-emerald-100/50 dark:to-emerald-900/30 rounded-xl border border-emerald-200 dark:border-emerald-800/50">
              <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Total Revenue</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(stats?.totalCollected || 0)}
              </p>
            </div>
            <div className="p-4 bg-gradient-to-br from-red-50 dark:from-red-950/40 to-red-100/50 dark:to-red-900/30 rounded-xl border border-red-200 dark:border-red-800/50">
              <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Total Expenses</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-400">
                {formatCurrency(stats?.totalExpenses || 0)}
              </p>
            </div>
            <div className="p-4 bg-gradient-to-br from-blue-50 dark:from-blue-950/40 to-blue-100/50 dark:to-blue-900/30 rounded-xl border border-blue-200 dark:border-blue-800/50">
              <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Total Salaries</p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                {formatCurrency(stats?.totalSalariesPaid || 0)}
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${
              (stats?.netProfit || 0) >= 0 
                ? 'bg-gradient-to-br from-emerald-50 dark:from-emerald-950/40 to-emerald-100/50 dark:to-emerald-900/30 border-emerald-200 dark:border-emerald-800/50' 
                : 'bg-gradient-to-br from-red-50 dark:from-red-950/40 to-red-100/50 dark:to-red-900/30 border-red-200 dark:border-red-800/50'
            }`}>
              <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Net Profit</p>
              <p className={`text-lg font-bold ${
                (stats?.netProfit || 0) >= 0 
                  ? 'text-emerald-700 dark:text-emerald-400' 
                  : 'text-red-700 dark:text-red-400'
              }`}>
                {formatCurrency(stats?.netProfit || 0)}
              </p>
            </div>
            <div className="p-4 bg-gradient-to-br from-amber-50 dark:from-amber-950/40 to-amber-100/50 dark:to-amber-900/30 rounded-xl border border-amber-200 dark:border-amber-800/50">
              <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Outstanding Balance</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                {formatCurrency(stats?.totalOutstanding || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-zinc-50">Recent Payments</h2>
            <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">Latest payment transactions</p>
          </div>
          <Link 
            to="/payments" 
            className="text-sm font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1"
          >
            View all
            <ArrowRight size={16} />
          </Link>
        </div>
        {paymentsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-16 rounded-xl"></div>
            ))}
          </div>
        ) : recentPayments && recentPayments.length > 0 ? (
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
                    <td className="font-medium">
                      {new Date(payment.payment_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="font-medium text-slate-900 dark:text-zinc-50">{payment.tenants?.name || 'N/A'}</td>
                    <td className="text-slate-600 dark:text-zinc-400">{payment.units?.unit_number || 'N/A'}</td>
                    <td className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(payment.amount)}</td>
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
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="text-slate-400 dark:text-zinc-600" size={24} />
            </div>
            <p className="text-slate-500 dark:text-zinc-400 font-medium">No recent payments</p>
            <p className="text-sm text-slate-400 dark:text-zinc-500 mt-1">Payments will appear here once recorded</p>
          </div>
        )}
      </div>
    </div>
  )
}

