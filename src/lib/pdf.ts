import jsPDF from 'jspdf'
import { formatCurrency, formatDate } from './utils'
import { readGlobalPaymentSettings, resolvePaymentInstructions } from './payment-instructions'

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
  if (payment.bills?.billing_month) {
    doc.text(
      `Billing month credited: ${new Date(payment.bills.billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      20,
      yPos
    )
    yPos += 7
  }
  const tender = (payment.payment_method || '').toString()
  if (tender) {
    doc.text(`Payment channel: ${tender.toUpperCase()}`, 20, yPos)
    yPos += 7
  }

  const global = readGlobalPaymentSettings()
  const resolved = resolvePaymentInstructions(payment.building_payment ?? null, global)

  if (resolved.method || resolved.paybill || resolved.account || resolved.notes) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('How to pay', 20, yPos)
    yPos += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (resolved.method) {
      doc.text(`Method: ${resolved.method}`, 20, yPos)
      yPos += 6
    }
    if (resolved.paybill) {
      doc.text(`Paybill: ${resolved.paybill}`, 20, yPos)
      yPos += 6
    }
    if (resolved.account) {
      doc.text(`Account: ${resolved.account}`, 20, yPos)
      yPos += 6
    }
    if (resolved.notes) {
      const lines = doc.splitTextToSize(resolved.notes, 170)
      doc.text(lines, 20, yPos)
      yPos += 6 * lines.length
    }
  }

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
  
  const globalInv = readGlobalPaymentSettings()
  const resolvedInv = resolvePaymentInstructions(bill.building_payment ?? null, globalInv)

  if (resolvedInv.method || resolvedInv.paybill || resolvedInv.account || resolvedInv.notes) {
    yPos += 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Payment Options', 20, yPos)
    yPos += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (resolvedInv.method) {
      doc.text(`Method: ${resolvedInv.method}`, 20, yPos)
      yPos += 6
    }
    if (resolvedInv.paybill) {
      doc.text(`Paybill: ${resolvedInv.paybill}`, 20, yPos)
      yPos += 6
    }
    if (resolvedInv.account) {
      doc.text(`Account: ${resolvedInv.account}`, 20, yPos)
      yPos += 6
    }
    if (resolvedInv.notes) {
      const invLines = doc.splitTextToSize(resolvedInv.notes, 170)
      doc.text(invLines, 20, yPos)
      yPos += 6 * invLines.length
    }
  }

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
  const global = readGlobalPaymentSettings()

  for (let index = 0; index < bills.length; index++) {
    const bill = bills[index]
    if (index > 0) {
      doc.addPage()
    }

    const resolved = resolvePaymentInstructions(bill.building_payment ?? null, global)
    
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

    if (resolved.method || resolved.paybill || resolved.account || resolved.notes) {
      yPos += 10
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('Payment Options', 20, yPos)
      yPos += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      if (resolved.method) {
        doc.text(`Method: ${resolved.method}`, 20, yPos)
        yPos += 6
      }
      if (resolved.paybill) {
        doc.text(`Paybill: ${resolved.paybill}`, 20, yPos)
        yPos += 6
      }
      if (resolved.account) {
        doc.text(`Account: ${resolved.account}`, 20, yPos)
        yPos += 6
      }
      if (resolved.notes) {
        const bulkLines = doc.splitTextToSize(resolved.notes, 170)
        doc.text(bulkLines, 20, yPos)
        yPos += 6 * bulkLines.length
      }
    }

    // Footer
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Please make payment by the due date. Thank you!', 105, 280, { align: 'center' })
  }

  doc.save(`invoices-${formatDate(new Date().toISOString()).replace(/\//g, '-')}.pdf`)
}

// Generate optimized lease end settlement receipt PDF (text-based, no image conversion)
export function generateLeaseEndSettlementPDF(receipt: any, filename: string) {
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const leftMargin = 20
  const rightMargin = 20
  const contentWidth = pageWidth - leftMargin - rightMargin
  let yPos = 15

  // Header
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 64, 175)
  doc.text('LEASE END SETTLEMENT RECEIPT', pageWidth / 2, yPos, { align: 'center' })
  yPos += 12

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`Settlement Date: ${receipt.leaseEndDate}`, pageWidth / 2, yPos, { align: 'center' })
  yPos += 10

  // Separator line
  doc.setDrawColor(30, 64, 175)
  doc.setLineWidth(0.5)
  doc.line(leftMargin, yPos, pageWidth - rightMargin, yPos)
  yPos += 8

  // Tenant Information Section
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 64, 175)
  doc.text('TENANT INFORMATION', leftMargin, yPos)
  yPos += 7

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(26, 41, 59)
  doc.text(`Tenant Name: ${receipt.tenantName}`, leftMargin, yPos)
  yPos += 5
  doc.text(`Phone Number: ${receipt.tenantPhone}`, leftMargin, yPos)
  yPos += 5
  doc.text(`Unit Number: ${receipt.unitNumber}`, leftMargin, yPos)
  yPos += 5
  doc.text(`Building: ${receipt.buildingName}`, leftMargin, yPos)
  yPos += 10

  // Deposit & Settlement Summary Section
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 64, 175)
  doc.text('DEPOSIT & SETTLEMENT SUMMARY', leftMargin, yPos)
  yPos += 7

  // Settlement box background
  doc.setFillColor(240, 249, 255)
  doc.rect(leftMargin, yPos - 1, contentWidth, 60, 'F')
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  
  let lineY = yPos + 3
  doc.text('Security Deposit Amount:', leftMargin + 3, lineY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 64, 175)
  doc.text(formatCurrency(receipt.depositAmount), pageWidth - rightMargin - 3, lineY, { align: 'right' })
  
  lineY += 6
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(71, 85, 105)
  doc.text('Deductions Breakdown:', leftMargin + 3, lineY)
  
  lineY += 5
  if (receipt.existingDeductions > 0) {
    doc.text(`Previous Deductions: ${formatCurrency(receipt.existingDeductions)}`, leftMargin + 8, lineY)
    lineY += 4
  }
  if (receipt.arrears > 0) {
    doc.text(`Outstanding Arrears: ${formatCurrency(receipt.arrears)}`, leftMargin + 8, lineY)
    lineY += 4
  }
  if (receipt.damages > 0) {
    doc.text(`Damages: ${formatCurrency(receipt.damages)}`, leftMargin + 8, lineY)
    lineY += 4
  }
  if (receipt.meterWaterDeduction && receipt.meterWaterDeduction > 0) {
    doc.text(`Water Meter Deduction: ${formatCurrency(receipt.meterWaterDeduction)}`, leftMargin + 8, lineY)
    lineY += 4
  }
  if (receipt.meterElecDeduction && receipt.meterElecDeduction > 0) {
    doc.text(`Electricity Meter Deduction: ${formatCurrency(receipt.meterElecDeduction)}`, leftMargin + 8, lineY)
  }
  
  yPos += 62

  // Total Deductions
  doc.setDrawColor(30, 64, 175)
  doc.setLineWidth(0.3)
  doc.line(leftMargin, yPos, pageWidth - rightMargin, yPos)
  yPos += 3

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 64, 175)
  doc.text('Total Deducted:', leftMargin, yPos)
  doc.text(formatCurrency(receipt.totalDeductions), pageWidth - rightMargin, yPos, { align: 'right' })
  yPos += 7

  // Refund Amount (highlighted)
  doc.setFillColor(240, 253, 244)
  doc.rect(leftMargin, yPos - 4, contentWidth, 8, 'F')
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(5, 150, 105)
  doc.text('Amount to Refund:', leftMargin + 3, yPos + 1)
  doc.text(formatCurrency(receipt.refundAmount), pageWidth - rightMargin - 3, yPos + 1, { align: 'right' })
  yPos += 12

  // Unpaid Bills Table (if any)
  if (receipt.unpaidBills && receipt.unpaidBills.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 64, 175)
    doc.text('UNPAID BILLS BREAKDOWN', leftMargin, yPos)
    yPos += 7

    // Table headers
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.setFillColor(30, 64, 175)
    
    const row1X = [leftMargin, leftMargin + 40, leftMargin + 65, leftMargin + 90, leftMargin + 115]
    
    doc.rect(leftMargin, yPos - 4, contentWidth, 6, 'F')
    doc.text('Billing Month', row1X[0], yPos)
    doc.text('Rent', row1X[1] + 20, yPos, { align: 'right' })
    doc.text('Water', row1X[2] + 20, yPos, { align: 'right' })
    doc.text('Electricity', row1X[3] + 20, yPos, { align: 'right' })
    doc.text('Balance', row1X[4] + 30, yPos, { align: 'right' })
    yPos += 6

    // Table rows
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)

    receipt.unpaidBills.forEach((bill: any) => {
      doc.text(bill.month.substring(0, 7), leftMargin + 1, yPos)
      doc.text(formatCurrency(bill.rent), row1X[1] + 20, yPos, { align: 'right' })
      doc.text(formatCurrency(bill.water), row1X[2] + 20, yPos, { align: 'right' })
      doc.text(formatCurrency(bill.electricity), row1X[3] + 20, yPos, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(220, 38, 38)
      doc.text(formatCurrency(bill.balance), row1X[4] + 30, yPos, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(71, 85, 105)
      yPos += 5
    })

    yPos += 3
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text('These amounts have been deducted from the security deposit.', leftMargin, yPos)
    yPos += 6
  }

  // Damages Notes (if any)
  if (receipt.damagesDescription) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 64, 175)
    doc.text('DAMAGES NOTES', leftMargin, yPos)
    yPos += 6

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.setFillColor(248, 250, 252)
    doc.rect(leftMargin, yPos - 3, contentWidth, 12, 'F')
    
    const wrappedText = doc.splitTextToSize(receipt.damagesDescription, contentWidth - 6)
    doc.text(wrappedText, leftMargin + 3, yPos)
    yPos += wrappedText.length * 4 + 5
  }

  // Footer
  yPos = pageHeight - 15
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text('This is an official settlement receipt for lease end processing.', pageWidth / 2, yPos, { align: 'center' })
  yPos += 4
  doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: 'center' })

  doc.save(filename)
}

// Export an arbitrary DOM element (by id) as a PDF using html2canvas + jsPDF
// NOTE: Use with caution - this creates large files due to PNG image conversion
// For text-based documents, prefer native PDF text generation
export async function exportElementToPDF(elementId: string, filename = 'report.pdf') {
  // Dynamically import html2canvas to keep bundle smaller
  const html2canvas = (await import('html2canvas')).default

  const element = document.getElementById(elementId)
  if (!element) {
    console.warn('exportElementToPDF: element not found', elementId)
    return
  }

  // Use lower scale (1.0 instead of 2) to reduce file size for large documents
  const canvas = await html2canvas(element as HTMLElement, { scale: 1, useCORS: true, logging: false })
  const imgData = canvas.toDataURL('image/png', 0.75)

  const pdf = new jsPDF('p', 'mm', 'a4')
  const imgProps = pdf.getImageProperties(imgData)
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width
  const pageHeight = pdf.internal.pageSize.getHeight()

  let heightLeft = pdfHeight
  let position = 0

  pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - pdfHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight)
    heightLeft -= pageHeight
  }

  pdf.save(filename)
}

