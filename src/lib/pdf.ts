import jsPDF from 'jspdf'
import { formatCurrency, formatDate } from './utils'

export async function generateReceiptPDF(payment: any) {
  const doc = new jsPDF()
  
  // Header
  doc.setFontSize(20)
  doc.text('PAYMENT RECEIPT', 105, 20, { align: 'center' })
  
  doc.setFontSize(10)
  doc.text(`Receipt #: ${payment.id.slice(0, 8).toUpperCase()}`, 20, 35)
  doc.text(`Date: ${formatDate(payment.payment_date)}`, 20, 42)
  
  // Payment Details
  doc.setFontSize(12)
  doc.text('Payment Details', 20, 55)
  
  doc.setFontSize(10)
  let yPos = 65
  doc.text(`Tenant: ${payment.tenants?.name || 'N/A'}`, 20, yPos)
  yPos += 7
  doc.text(`Unit: ${payment.units?.unit_number || 'N/A'}`, 20, yPos)
  yPos += 7
  doc.text(`Amount: ${formatCurrency(payment.amount)}`, 20, yPos)
  yPos += 7
  doc.text(`Payment Method: ${payment.payment_method.toUpperCase()}`, 20, yPos)
  yPos += 7
  if (payment.notes) {
    doc.text(`Notes: ${payment.notes}`, 20, yPos)
  }
  
  // Footer
  doc.setFontSize(8)
  doc.text('Thank you for your payment!', 105, 280, { align: 'center' })
  
  doc.save(`receipt-${payment.id.slice(0, 8)}.pdf`)
}

export async function generateInvoicePDF(bill: any) {
  const doc = new jsPDF()
  
  // Header
  doc.setFontSize(20)
  doc.text('INVOICE', 105, 20, { align: 'center' })
  
  doc.setFontSize(10)
  doc.text(`Invoice #: ${bill.id.slice(0, 8).toUpperCase()}`, 20, 35)
  doc.text(`Billing Month: ${bill.billing_month}`, 20, 42)
  doc.text(`Date: ${formatDate(bill.created_at)}`, 20, 49)
  
  // Tenant Info
  doc.setFontSize(12)
  doc.text('Bill To:', 20, 65)
  doc.setFontSize(10)
  doc.text(bill.tenants?.name || 'N/A', 20, 72)
  doc.text(`Unit: ${bill.units?.unit_number || 'N/A'}`, 20, 79)
  
  // Items
  doc.setFontSize(12)
  doc.text('Items', 20, 95)
  
  let yPos = 105
  doc.setFontSize(10)
  
  if (bill.water_amount > 0) {
    doc.text(`Water (${bill.water_units_consumed} units @ ${formatCurrency(bill.water_rate)}/unit)`, 20, yPos)
    doc.text(formatCurrency(bill.water_amount), 180, yPos, { align: 'right' })
    yPos += 7
  }
  
  if (bill.elec_amount > 0) {
    doc.text(`Electricity (${bill.elec_units_consumed} units @ ${formatCurrency(bill.elec_rate)}/unit)`, 20, yPos)
    doc.text(formatCurrency(bill.elec_amount), 180, yPos, { align: 'right' })
    yPos += 7
  }
  
  if (bill.rent_amount > 0) {
    doc.text('Monthly Rent', 20, yPos)
    doc.text(formatCurrency(bill.rent_amount), 180, yPos, { align: 'right' })
    yPos += 7
  }
  
  if (bill.arrears_brought_forward > 0) {
    doc.text('Arrears Brought Forward', 20, yPos)
    doc.text(formatCurrency(bill.arrears_brought_forward), 180, yPos, { align: 'right' })
    yPos += 7
  }
  
  // Total
  yPos += 5
  doc.setLineWidth(0.5)
  doc.line(20, yPos, 190, yPos)
  yPos += 7
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Total Amount:', 20, yPos)
  doc.text(formatCurrency(bill.total_amount), 180, yPos, { align: 'right' })
  yPos += 7
  
  doc.setFont('helvetica', 'normal')
  doc.text(`Amount Paid: ${formatCurrency(bill.amount_paid)}`, 20, yPos)
  yPos += 7
  
  doc.setFont('helvetica', 'bold')
  doc.text(`Balance Due: ${formatCurrency(bill.balance)}`, 20, yPos)
  
  // Footer
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Please make payment by the due date. Thank you!', 105, 280, { align: 'center' })
  
  doc.save(`invoice-${bill.id.slice(0, 8)}.pdf`)
}

