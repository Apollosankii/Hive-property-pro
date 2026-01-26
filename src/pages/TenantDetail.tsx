import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import { ArrowLeft, User, Phone, Mail, Home, Receipt, CreditCard, Calendar, AlertCircle } from 'lucide-react'

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

  const { data: settlements } = useQuery({
    queryKey: ['tenant-settlements', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lease_end_settlements')
        .select('*')
        .eq('tenant_id', id)
        .order('lease_end_date', { ascending: false })
      
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

      {/* Lease Information */}
      {(tenant.lease_start || tenant.lease_end) && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="text-primary-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Lease Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tenant.lease_start && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-1">Lease Start Date</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatDate(tenant.lease_start)}
                </p>
              </div>
            )}
            {tenant.lease_end && (
              <div className={`p-4 rounded-lg border ${
                tenant.status === 'inactive' 
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                  : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              }`}>
                <p className={`text-sm mb-1 ${
                  tenant.status === 'inactive' 
                    ? 'text-red-600 dark:text-red-400' 
                    : 'text-orange-600 dark:text-orange-400'
                }`}>
                  Lease End Date
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {formatDate(tenant.lease_end)}
                </p>
              </div>
            )}
          </div>
          {tenant.lease_end_notes && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Settlement Notes</p>
              <p className="text-gray-900 dark:text-white">{tenant.lease_end_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Lease End Settlement */}
      {settlements && settlements.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="text-orange-600" size={24} />
            <h2 className="text-xl font-bold text-gray-900">Lease End Settlement</h2>
          </div>
          {settlements.map((settlement: any) => (
            <div key={settlement.id} className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-orange-600 dark:text-orange-400 mb-1">Settlement Date</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatDate(settlement.lease_end_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-1">Total Arrears</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(settlement.total_arrears)}</p>
                </div>
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400 mb-1">Amount Deducted</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(settlement.total_deductible)}</p>
                </div>
                <div>
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">Amount Refunded</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(settlement.amount_to_refund)}</p>
                </div>
              </div>
              {settlement.settlement_notes && (
                <div className="mt-3 p-3 bg-white dark:bg-zinc-800 rounded border border-gray-200 dark:border-zinc-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Notes</p>
                  <p className="text-gray-900 dark:text-white">{settlement.settlement_notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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

