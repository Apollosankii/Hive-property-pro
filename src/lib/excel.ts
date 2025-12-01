import * as XLSX from 'xlsx'

export function exportToExcel(data: any[], filename: string = 'export') {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
  
  // Auto-size columns
  const cols = Object.keys(data[0] || {}).map(() => ({ wch: 15 }))
  worksheet['!cols'] = cols
  
  XLSX.writeFile(workbook, `${filename}-${new Date().toISOString().split('T')[0]}.xlsx`)
}

