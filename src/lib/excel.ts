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
  
  // Define column widths optimized to fit on one page laterally
  // Landscape A4: ~11.7" width, with margins ~10.7" usable = ~75-80 character units max
  // Total target: ~75 character units to ensure fit with scaling
  const columnWidths = [
    { wch: 8 },  // Invoice # (reduced from 10)
    { wch: 12 }, // Billing Month (reduced from 15)
    { wch: 8 },  // Unit Number (reduced from 10)
    { wch: 14 }, // Building Name (reduced from 18)
    { wch: 14 }, // Tenant Name (reduced from 18)
    { wch: 11 }, // Tenant Phone (reduced from 13)
    
    // Water columns (reduced widths)
    { wch: 14 }, // Water Previous Reading (reduced from 18)
    { wch: 14 }, // Water Current Reading (reduced from 18)
    { wch: 12 }, // Water Units Consumed (reduced from 16)
    { wch: 11 }, // Water Rate (reduced from 14)
    { wch: 10 }, // Water Amount (reduced from 12)
    
    // Electricity columns (reduced widths)
    { wch: 15 }, // Electricity Previous Reading (reduced from 20)
    { wch: 15 }, // Electricity Current Reading (reduced from 20)
    { wch: 13 }, // Electricity Units Consumed (reduced from 18)
    { wch: 12 }, // Electricity Rate (reduced from 16)
    { wch: 11 }, // Electricity Amount (reduced from 14)
    
    // Rent and Utilities (reduced widths)
    { wch: 10 }, // Monthly Rent (reduced from 12)
    { wch: 10 }, // Garbage Amount (reduced from 13)
    { wch: 11 }, // Maintenance Amount (reduced from 15)
    { wch: 14 }, // Other Utilities Amount (reduced from 18)
    { wch: 10 }, // Total Utilities (reduced from 13)
    
    // Financial Summary (reduced widths)
    { wch: 14 }, // Arrears Brought Forward (reduced from 18)
    { wch: 10 }, // Total Amount (reduced from 12)
    { wch: 10 }, // Amount Paid (reduced from 12)
    { wch: 10 }, // Balance (reduced from 12)
    { wch: 8 },  // Status (reduced from 10)
    
    // Dates (reduced widths)
    { wch: 10 }, // Created Date (reduced from 12)
    { wch: 10 }, // Updated Date (reduced from 12)
  ]
  
  // Calculate total width
  const totalWidth = columnWidths.reduce((sum, col) => sum + col.wch, 0)
  console.log(`Total column width: ${totalWidth} character units`)
  
  worksheet['!cols'] = columnWidths
  
  // Configure page setup to fit on one page laterally (horizontally)
  // Using narrow margins and landscape orientation
  worksheet['!margins'] = {
    left: 0.25,   // Narrow margin
    right: 0.25,  // Narrow margin
    top: 0.75,
    bottom: 0.75,
    header: 0.3,
    footer: 0.3,
  }
  
  // Page setup for landscape A4 - fit to 1 page wide
  worksheet['!pageSetup'] = {
    fitToWidth: 1,        // Fit to 1 page wide (most important)
    fitToHeight: 0,       // No height limit (use as many pages as needed)
    orientation: 'landscape', // Landscape orientation
    paperSize: 9,         // A4 paper size
    scale: 100,           // Start with 100% scale, Excel will auto-adjust if needed
    horizontalDpi: 200,
    verticalDpi: 200,
  }
  
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
  
  // Configure summary page setup
  summarySheet['!margins'] = {
    left: 0.5,
    right: 0.5,
    top: 0.75,
    bottom: 0.75,
    header: 0.5,
    footer: 0.5,
  }
  
  summarySheet['!pageSetup'] = {
    fitToWidth: 1,
    fitToHeight: 1,
    orientation: 'portrait',
    paperSize: 9,
    scale: 100,
  }
  
  XLSX.writeFile(workbook, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`)
}

