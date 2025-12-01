import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Payment } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Download } from 'lucide-react'
import { generateReceiptPDF } from '@/lib/pdf'

export default function Payments() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [billId, setBillId] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'bank'>('cash')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const queryClient = useQueryClient()

  const { data: pendingBills } = useQuery({
    queryKey: ['pending-bills'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bills')
        .select('*, units(unit_number, buildings(name)), tenants(name, phone)')
        .neq('status', 'paid')
        .order('created_at', { ascending: false })
      return data || []
    },
  })

  const { data: payments } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*, bills(billing_month), units(unit_number, buildings(name)), tenants(name)')
        .order('payment_date', { ascending: false })
        .limit(50)
      
      if (error) throw error
      return data || []
    },
  })

  const uploadReceipt = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `receipts/${Math.random()}.${fileExt}`
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(fileName, file)

    if (error) throw error
    const { data: { publicUrl } } = supabase.storage
      .from('receipts')
      .getPublicUrl(data.path)
    return publicUrl
  }

  const createPaymentMutation = useMutation({
    mutationFn: async (paymentData: Partial<Payment> & { receipt_url?: string }) => {
      const bill = pendingBills?.find((b: any) => b.id === billId)
      if (!bill) throw new Error('Bill not found')

      // Create payment
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData])
        .select()
        .single()

      if (paymentError) throw paymentError

      // Update bill
      const newAmountPaid = (bill.amount_paid || 0) + paymentData.amount!
      const newBalance = bill.total_amount - newAmountPaid
      const newStatus =
        newBalance <= 0 ? 'paid' : newAmountPaid > 0 ? 'partial' : 'pending'

      const { error: billError } = await supabase
        .from('bills')
        .update({
          amount_paid: newAmountPaid,
          balance: newBalance,
          status: newStatus,
        })
        .eq('id', billId)

      if (billError) throw billError

      return payment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['pending-bills'] })
      queryClient.invalidateQueries({ queryKey: ['bills'] })
      queryClient.invalidateQueries({ queryKey: ['tenants'] })
      setIsModalOpen(false)
      resetForm()
    },
  })

  const resetForm = () => {
    setBillId('')
    setAmount('')
    setPaymentMethod('cash')
    setReceiptFile(null)
    setNotes('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    let receiptUrl: string | undefined
    if (receiptFile) {
      receiptUrl = await uploadReceipt(receiptFile)
    }

    const bill = pendingBills?.find((b: any) => b.id === billId)
    if (!bill) return

    const paymentData = {
      bill_id: billId,
      unit_id: bill.unit_id,
      tenant_id: bill.tenant_id || '',
      amount: parseFloat(amount),
      payment_method: paymentMethod,
      receipt_url: receiptUrl,
      payment_date: new Date().toISOString(),
      notes: notes || undefined,
    }

    createPaymentMutation.mutate(paymentData)
  }

  const handleDownloadReceipt = async (payment: any) => {
    await generateReceiptPDF(payment)
  }

  const selectedBill = pendingBills?.find((b: any) => b.id === billId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Payments</h1>
        <button
          onClick={() => {
            setIsModalOpen(true)
            resetForm()
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          Record Payment
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Tenant</th>
              <th>Unit</th>
              <th>Billing Month</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Receipt</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments?.map((payment: any) => (
              <tr key={payment.id}>
                <td>{formatDate(payment.payment_date)}</td>
                <td>{payment.tenants?.name || 'N/A'}</td>
                <td>
                  {payment.units?.unit_number} ({payment.units?.buildings?.name})
                </td>
                <td>{payment.bills?.billing_month || 'N/A'}</td>
                <td className="font-semibold text-green-600">
                  {formatCurrency(payment.amount)}
                </td>
                <td>
                  <span className="badge badge-info capitalize">
                    {payment.payment_method}
                  </span>
                </td>
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
                <td>
                  <button
                    onClick={() => handleDownloadReceipt(payment)}
                    className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                    title="Download Receipt"
                  >
                    <Download size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Record Payment</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Bill
                </label>
                <select
                  value={billId}
                  onChange={(e) => setBillId(e.target.value)}
                  required
                  className="input"
                >
                  <option value="">Select a bill</option>
                  {pendingBills?.map((bill: any) => (
                    <option key={bill.id} value={bill.id}>
                      {bill.units?.unit_number} - {bill.tenants?.name} - Balance:{' '}
                      {formatCurrency(bill.balance)}
                    </option>
                  ))}
                </select>
                {selectedBill && (
                  <div className="mt-2 p-3 bg-gray-50 rounded text-sm">
                    <p>
                      <strong>Total:</strong> {formatCurrency(selectedBill.total_amount)}
                    </p>
                    <p>
                      <strong>Balance:</strong>{' '}
                      <span className="text-red-600">
                        {formatCurrency(selectedBill.balance)}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (KES)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="input"
                  placeholder="0.00"
                  max={selectedBill?.balance}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as 'cash' | 'mpesa' | 'bank')
                  }
                  className="input"
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload Receipt (Optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Additional notes..."
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false)
                    resetForm()
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn btn-primary"
                  disabled={createPaymentMutation.isPending}
                >
                  {createPaymentMutation.isPending ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

