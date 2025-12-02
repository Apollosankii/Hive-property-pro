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
  doc.text(`Billing Month: ${new Date(bill.billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`, 20, 42)
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
  
  if (bill.water_amount > 0 || bill.water_prev_reading || bill.water_current_reading) {
    doc.text('Water:', 20, yPos)
    doc.text(`Previous: ${bill.water_prev_reading || 0} | Current: ${bill.water_current_reading || 0} | Units: ${bill.water_units_consumed || 0} @ ${formatCurrency(bill.water_rate || 0)}/unit`, 30, yPos + 5)
    doc.text(formatCurrency(bill.water_amount || 0), 180, yPos, { align: 'right' })
    yPos += 12
  }
  
  if (bill.elec_amount > 0 || bill.elec_prev_reading || bill.elec_current_reading) {
    doc.text('Electricity:', 20, yPos)
    doc.text(`Previous: ${bill.elec_prev_reading || 0} | Current: ${bill.elec_current_reading || 0} | Units: ${bill.elec_units_consumed || 0} @ ${formatCurrency(bill.elec_rate || 0)}/unit`, 30, yPos + 5)
    doc.text(formatCurrency(bill.elec_amount || 0), 180, yPos, { align: 'right' })
    yPos += 12
  }
  
  if (bill.garbage_amount > 0) {
    doc.text('Garbage', 20, yPos)
    doc.text(formatCurrency(bill.garbage_amount), 180, yPos, { align: 'right' })
    yPos += 7
  }
  
  if (bill.maintenance_amount > 0) {
    doc.text('Maintenance', 20, yPos)
    doc.text(formatCurrency(bill.maintenance_amount), 180, yPos, { align: 'right' })
    yPos += 7
  }
  
  if (bill.other_utilities_amount > 0) {
    doc.text('Other Utilities', 20, yPos)
    doc.text(formatCurrency(bill.other_utilities_amount), 180, yPos, { align: 'right' })
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

// Generate bulk invoices - one PDF with multiple pages
export async function generateBulkInvoicesPDF(bills: any[]) {
  if (bills.length === 0) return
  
  const doc = new jsPDF()
  
  bills.forEach((bill, index) => {
    if (index > 0) {
      doc.addPage()
    }
    
    // Header
    doc.setFontSize(20)
    doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', 105, 20, { align: 'center' })
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Invoice #: ${bill.id.slice(0, 8).toUpperCase()}`, 20, 35)
    doc.text(`Billing Month: ${new Date(bill.billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`, 20, 42)
    doc.text(`Date: ${formatDate(bill.created_at)}`, 20, 49)
    
    // Tenant Info
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Bill To:', 20, 65)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(bill.tenants?.name || 'N/A', 20, 72)
    doc.text(`Unit: ${bill.units?.unit_number || 'N/A'} - ${bill.units?.buildings?.name || 'N/A'}`, 20, 79)
    
    // Items
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Charges Breakdown', 20, 95)
    
    let yPos = 105
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    
    // Water Details
    if (bill.water_amount > 0 || bill.water_prev_reading || bill.water_current_reading) {
      doc.text('Water:', 20, yPos)
      doc.text(`Previous: ${bill.water_prev_reading || 0} | Current: ${bill.water_current_reading || 0} | Units: ${bill.water_units_consumed || 0} @ ${formatCurrency(bill.water_rate || 0)}/unit`, 30, yPos + 5)
      doc.text(formatCurrency(bill.water_amount || 0), 180, yPos, { align: 'right' })
      yPos += 12
    }
    
    // Electricity Details
    if (bill.elec_amount > 0 || bill.elec_prev_reading || bill.elec_current_reading) {
      doc.text('Electricity:', 20, yPos)
      doc.text(`Previous: ${bill.elec_prev_reading || 0} | Current: ${bill.elec_current_reading || 0} | Units: ${bill.elec_units_consumed || 0} @ ${formatCurrency(bill.elec_rate || 0)}/unit`, 30, yPos + 5)
      doc.text(formatCurrency(bill.elec_amount || 0), 180, yPos, { align: 'right' })
      yPos += 12
    }
    
    if (bill.rent_amount > 0) {
      doc.text('Monthly Rent', 20, yPos)
      doc.text(formatCurrency(bill.rent_amount), 180, yPos, { align: 'right' })
      yPos += 7
    }
    
    if (bill.garbage_amount > 0) {
      doc.text('Garbage', 20, yPos)
      doc.text(formatCurrency(bill.garbage_amount), 180, yPos, { align: 'right' })
      yPos += 7
    }
    
    if (bill.maintenance_amount > 0) {
      doc.text('Maintenance', 20, yPos)
      doc.text(formatCurrency(bill.maintenance_amount), 180, yPos, { align: 'right' })
      yPos += 7
    }
    
    if (bill.other_utilities_amount > 0) {
      doc.text('Other Utilities', 20, yPos)
      doc.text(formatCurrency(bill.other_utilities_amount), 180, yPos, { align: 'right' })
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
  })
  
  doc.save(`invoices-${formatDate(new Date().toISOString()).replace(/\//g, '-')}.pdf`)
}

