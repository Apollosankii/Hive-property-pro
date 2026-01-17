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

// Define all available columns for bills
const ALL_BILL_COLUMNS = {
  'Invoice #': (bill: any) => bill.id.slice(0, 8).toUpperCase(),
  'Billing Month': (bill: any) => new Date(bill.billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  'Unit Number': (bill: any) => bill.units?.unit_number || 'N/A',
  'Building Name': (bill: any) => bill.units?.buildings?.name || 'N/A',
  'Tenant Name': (bill: any) => bill.tenants?.name || 'N/A',
  'Tenant Phone': (bill: any) => bill.tenants?.phone || 'N/A',
  'Water Previous Reading': (bill: any) => bill.water_prev_reading || 0,
  'Water Current Reading': (bill: any) => bill.water_current_reading || 0,
  'Water Units Consumed': (bill: any) => bill.water_units_consumed || 0,
  'Water Rate (per unit)': (bill: any) => bill.water_rate || 0,
  'Water Amount': (bill: any) => bill.water_amount || 0,
  'Electricity Previous Reading': (bill: any) => bill.elec_prev_reading || 0,
  'Electricity Current Reading': (bill: any) => bill.elec_current_reading || 0,
  'Electricity Units Consumed': (bill: any) => bill.elec_units_consumed || 0,
  'Electricity Rate (per unit)': (bill: any) => bill.elec_rate || 0,
  'Electricity Amount': (bill: any) => bill.elec_amount || 0,
  'Monthly Rent': (bill: any) => bill.rent_amount || 0,
  'Garbage Amount': (bill: any) => bill.garbage_amount || 0,
  'Maintenance Amount': (bill: any) => bill.maintenance_amount || 0,
  'Other Utilities Amount': (bill: any) => bill.other_utilities_amount || 0,
  'Total Utilities': (bill: any) => (bill.garbage_amount || 0) + (bill.maintenance_amount || 0) + (bill.other_utilities_amount || 0),
  'Arrears Brought Forward': (bill: any) => bill.arrears_brought_forward || 0,
  'Total Amount': (bill: any) => bill.total_amount || 0,
  'Amount Paid': (bill: any) => bill.amount_paid || 0,
  'Balance': (bill: any) => bill.balance || 0,
  'Status': (bill: any) => bill.status || 'pending',
  'Created Date': (bill: any) => new Date(bill.created_at).toLocaleDateString('en-US'),
  'Updated Date': (bill: any) => bill.updated_at ? new Date(bill.updated_at).toLocaleDateString('en-US') : 'N/A',
}

// Export bills to Excel with detailed structure
export function exportBillsToExcel(bills: any[], filename: string = 'bills-export', selectedColumns?: string[]) {
  if (!bills || bills.length === 0) {
    console.warn('No bills to export')
    return
  }

  // Use all columns if none selected, otherwise use only selected columns
  const columnsToUse = selectedColumns && selectedColumns.length > 0 ? selectedColumns : Object.keys(ALL_BILL_COLUMNS)
  
  // Transform bills data to Excel format with clearly defined columns
  const excelData = bills.map((bill) => {
    const row: any = {}
    columnsToUse.forEach(columnName => {
      const columnFn = ALL_BILL_COLUMNS[columnName as keyof typeof ALL_BILL_COLUMNS]
      if (columnFn) {
        row[columnName] = columnFn(bill)
      }
    })
    return row
  })

  const worksheet = XLSX.utils.json_to_sheet(excelData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Bills')
  
  // Map column names to their default widths
  const columnWidthMap: Record<string, number> = {
    'Invoice #': 8,
    'Billing Month': 12,
    'Unit Number': 8,
    'Building Name': 14,
    'Tenant Name': 14,
    'Tenant Phone': 11,
    'Water Previous Reading': 14,
    'Water Current Reading': 14,
    'Water Units Consumed': 12,
    'Water Rate (per unit)': 11,
    'Water Amount': 10,
    'Electricity Previous Reading': 15,
    'Electricity Current Reading': 15,
    'Electricity Units Consumed': 13,
    'Electricity Rate (per unit)': 12,
    'Electricity Amount': 11,
    'Monthly Rent': 10,
    'Garbage Amount': 10,
    'Maintenance Amount': 11,
    'Other Utilities Amount': 14,
    'Total Utilities': 10,
    'Arrears Brought Forward': 14,
    'Total Amount': 10,
    'Amount Paid': 10,
    'Balance': 10,
    'Status': 8,
    'Created Date': 10,
    'Updated Date': 10,
  }

  // Generate column widths based on selected columns
  const columnWidths = columnsToUse.map(columnName => ({
    wch: columnWidthMap[columnName] || 12
  }))
  
  // Calculate total width
  const totalWidth = columnWidths.reduce((sum, col) => sum + col.wch, 0)
  console.log(`Total column width: ${totalWidth} character units for ${columnsToUse.length} columns`)
  
  worksheet['!cols'] = columnWidths
  
  // Configure page setup to fit on one page laterally (horizontally)
  // Using narrow margins and landscape orientation if many columns, portrait if few
  const isLandscape = columnsToUse.length > 10
  worksheet['!margins'] = {
    left: 0.25,   // Narrow margin
    right: 0.25,  // Narrow margin
    top: 0.75,
    bottom: 0.75,
    header: 0.3,
    footer: 0.3,
  }
  
  // Page setup for A4 - fit to 1 page wide
  worksheet['!pageSetup'] = {
    fitToWidth: 1,        // Fit to 1 page wide (most important)
    fitToHeight: 0,       // No height limit (use as many pages as needed)
    orientation: isLandscape ? 'landscape' : 'portrait',
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

