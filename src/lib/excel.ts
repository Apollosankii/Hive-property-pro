import * as XLSX from 'xlsx'

export function exportToExcel(data: any[], filename: string = 'export') {
  if (!data || data.length === 0) {
    console.warn('No data to export')
    return
  }

  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  
  // Auto-size columns based on header and content
  const maxWidth = 50
  const minWidth = 10
  const cols = Object.keys(data[0] || {}).map((key) => {
    const headerWidth = key.length
    const contentWidth = Math.max(
      ...data.map((row) => {
        const value = row[key]
        return value ? String(value).length : 0
      })
    )
    const width = Math.min(Math.max(headerWidth, contentWidth) + 2, maxWidth)
    return { wch: Math.max(width, minWidth) }
  })
  worksheet['!cols'] = cols
  
  XLSX.writeFile(workbook, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`)
}

// Export bills to Excel with detailed structure
export function exportBillsToExcel(bills: any[], filename: string = 'bills-export') {
  if (!bills || bills.length === 0) {
    console.warn('No bills to export')
    return
  }

  // Transform bills data to Excel format with clearly defined columns
  const excelData = bills.map((bill) => {
    const totalUtilities = (bill.garbage_amount || 0) + (bill.maintenance_amount || 0) + (bill.other_utilities_amount || 0)
    
    return {
      'Invoice #': bill.id.slice(0, 8).toUpperCase(),
      'Billing Month': new Date(bill.billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      'Unit Number': bill.units?.unit_number || 'N/A',
      'Building Name': bill.units?.buildings?.name || 'N/A',
      'Tenant Name': bill.tenants?.name || 'N/A',
      'Tenant Phone': bill.tenants?.phone || 'N/A',
      
      // Water Details
      'Water Previous Reading': bill.water_prev_reading || 0,
      'Water Current Reading': bill.water_current_reading || 0,
      'Water Units Consumed': bill.water_units_consumed || 0,
      'Water Rate (per unit)': bill.water_rate || 0,
      'Water Amount': bill.water_amount || 0,
      
      // Electricity Details
      'Electricity Previous Reading': bill.elec_prev_reading || 0,
      'Electricity Current Reading': bill.elec_current_reading || 0,
      'Electricity Units Consumed': bill.elec_units_consumed || 0,
      'Electricity Rate (per unit)': bill.elec_rate || 0,
      'Electricity Amount': bill.elec_amount || 0,
      
      // Rent and Utilities
      'Monthly Rent': bill.rent_amount || 0,
      'Garbage Amount': bill.garbage_amount || 0,
      'Maintenance Amount': bill.maintenance_amount || 0,
      'Other Utilities Amount': bill.other_utilities_amount || 0,
      'Total Utilities': totalUtilities,
      
      // Financial Summary
      'Arrears Brought Forward': bill.arrears_brought_forward || 0,
      'Total Amount': bill.total_amount || 0,
      'Amount Paid': bill.amount_paid || 0,
      'Balance': bill.balance || 0,
      'Status': bill.status || 'pending',
      
      // Dates
      'Created Date': new Date(bill.created_at).toLocaleDateString('en-US'),
      'Updated Date': bill.updated_at ? new Date(bill.updated_at).toLocaleDateString('en-US') : 'N/A',
    }
  })

  const worksheet = XLSX.utils.json_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bills')
  
  // Define column widths for better readability
  const columnWidths = [
    { wch: 12 }, // Invoice #
    { wch: 18 }, // Billing Month
    { wch: 12 }, // Unit Number
    { wch: 20 }, // Building Name
    { wch: 20 }, // Tenant Name
    { wch: 15 }, // Tenant Phone
    
    // Water columns
    { wch: 22 }, // Water Previous Reading
    { wch: 22 }, // Water Current Reading
    { wch: 20 }, // Water Units Consumed
    { wch: 18 }, // Water Rate
    { wch: 14 }, // Water Amount
    
    // Electricity columns
    { wch: 28 }, // Electricity Previous Reading
    { wch: 28 }, // Electricity Current Reading
    { wch: 26 }, // Electricity Units Consumed
    { wch: 24 }, // Electricity Rate
    { wch: 20 }, // Electricity Amount
    
    // Rent and Utilities
    { wch: 14 }, // Monthly Rent
    { wch: 16 }, // Garbage Amount
    { wch: 18 }, // Maintenance Amount
    { wch: 22 }, // Other Utilities Amount
    { wch: 16 }, // Total Utilities
    
    // Financial Summary
    { wch: 22 }, // Arrears Brought Forward
    { wch: 14 }, // Total Amount
    { wch: 14 }, // Amount Paid
    { wch: 14 }, // Balance
    { wch: 12 }, // Status
    
    // Dates
    { wch: 14 }, // Created Date
    { wch: 14 }, // Updated Date
  ]
  
  worksheet['!cols'] = columnWidths
  
  // Add summary sheet
  const summaryData = [
    { Metric: 'Total Bills', Value: bills.length },
    { Metric: 'Total Amount', Value: bills.reduce((sum, b) => sum + (b.total_amount || 0), 0) },
    { Metric: 'Total Paid', Value: bills.reduce((sum, b) => sum + (b.amount_paid || 0), 0) },
    { Metric: 'Total Balance', Value: bills.reduce((sum, b) => sum + (b.balance || 0), 0) },
    { Metric: 'Paid Bills', Value: bills.filter((b) => b.status === 'paid').length },
    { Metric: 'Partial Bills', Value: bills.filter((b) => b.status === 'partial').length },
    { Metric: 'Pending Bills', Value: bills.filter((b) => b.status === 'pending').length },
  ]
  
  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')
  
  // Set summary column widths
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 15 }]
  
  XLSX.writeFile(workbook, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`)
}

