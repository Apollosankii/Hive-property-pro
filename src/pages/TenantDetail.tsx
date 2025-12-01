import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import { ArrowLeft, User, Phone, Mail, Home, Receipt, CreditCard } from 'lucide-react'

export default function TenantDetail() {
  const { id } = useParams<{ id: string }>()

  const { data: tenant } = useQuery({
    queryKey: ['tenant', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('*, units(unit_number, buildings(name), monthly_rent)')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    },
  })

  const { data: bills } = useQuery({
    queryKey: ['tenant-bills', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('tenant_id', id)
        .order('billing_month', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!id,
  })

  const { data: payments } = useQuery({
    queryKey: ['tenant-payments', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, bills(billing_month)')
        .eq('tenant_id', id)
        .order('payment_date', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!id,
  })

  if (!tenant) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const totalBalance = bills?.reduce((sum, b) => sum + (b.balance || 0), 0) || 0
  const totalPaid = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0

  return (
    <div className="space-y-6">
      <Link
        to="/tenants"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-primary-600"
      >
        <ArrowLeft size={20} />
        Back to Tenants
      </Link>

      <div className="card">
        <div className="flex items-start gap-6">
          {tenant.id_photo_url ? (
            <img
              src={tenant.id_photo_url}
              alt={tenant.name}
              className="w-24 h-24 rounded-lg object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-lg bg-gray-200 flex items-center justify-center">
              <User size={48} className="text-gray-400" />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{tenant.name}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Phone className="text-gray-400" size={20} />
                <span>{tenant.phone}</span>
              </div>
              {tenant.email && (
                <div className="flex items-center gap-3">
                  <Mail className="text-gray-400" size={20} />
                  <span>{tenant.email}</span>
                </div>
              )}
              {tenant.units && (
                <div className="flex items-center gap-3">
                  <Home className="text-gray-400" size={20} />
                  <span>
                    {tenant.units.unit_number} - {tenant.units.buildings?.name}
                  </span>
                </div>
              )}
              <div>
                <span
                  className={`badge ${
                    tenant.status === 'active' ? 'badge-success' : 'badge-warning'
                  }`}
                >
                  {tenant.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <CreditCard className="text-primary-600" size={24} />
            <h3 className="font-semibold">Current Balance</h3>
          </div>
          <p
            className={`text-3xl font-bold ${
              totalBalance > 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(totalBalance)}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Receipt className="text-green-600" size={24} />
            <h3 className="font-semibold">Total Paid</h3>
          </div>
          <p className="text-3xl font-bold text-green-600">
            {formatCurrency(totalPaid)}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <Home className="text-blue-600" size={24} />
            <h3 className="font-semibold">Monthly Rent</h3>
          </div>
          <p className="text-3xl font-bold">
            {formatCurrency(tenant.units?.monthly_rent || 0)}
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Billing History</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Billing Month</th>
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
              {bills?.map((bill) => (
                <tr key={bill.id}>
                  <td>{formatMonth(bill.billing_month)}</td>
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
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Payment History</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Billing Month</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments?.map((payment: any) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.payment_date)}</td>
                  <td className="font-semibold text-green-600">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td>
                    <span className="badge badge-info capitalize">
                      {payment.payment_method}
                    </span>
                  </td>
                  <td>{payment.bills?.billing_month || 'N/A'}</td>
                  <td>
                    {payment.receipt_url ? (
                      <a
                        href={payment.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-gray-400">No receipt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

