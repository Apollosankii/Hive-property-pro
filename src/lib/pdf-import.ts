import * as pdfjsLib from 'pdfjs-dist'

// Set up the worker for pdfjs
if (typeof window !== 'undefined') {
  // Use jsdelivr CDN which is reliable and fast
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`
}

export interface ParsedTableRow {
  unit: string
  names: string
  waterOct?: number
  waterSept?: number
  waterUnits?: number
  waterRate?: number
  amountWater?: number
  electricityOct?: number
  electricitySept?: number
  electUnits?: number
  rateElectricity?: number
  amountPower?: number
  rentArrears?: number
  garbageFee?: number
  total?: number
  paid?: number
  due?: number
}

/**
 * Extract text content from PDF
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let fullText = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
    fullText += pageText + '\n'
  }

  return fullText
}

/**
 * Parse table data from PDF text
 * This function attempts to identify and parse table structures from the PDF text
 */
function parseTableFromText(text: string): ParsedTableRow[] {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  const rows: ParsedTableRow[] = []

  // Try to find the header row
  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase()
    if (line.includes('unit') && (line.includes('name') || line.includes('water') || line.includes('electricity'))) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) {
    // Try alternative: look for data rows that start with unit identifiers (A1, A2, etc.)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const unitMatch = line.match(/^([A-Z]\d+)/i)
      if (unitMatch) {
        headerIndex = i - 1 // Assume header is one line before
        break
      }
    }
  }

  // Parse data rows
  const dataStartIndex = headerIndex >= 0 ? headerIndex + 1 : 0

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i]
    
    // Skip empty lines or lines that look like headers
    if (!line || line.length < 3) continue
    if (line.toLowerCase().includes('unit') && line.toLowerCase().includes('name')) continue

    // Try to match unit pattern (A1, A2, A3, etc.)
    const unitMatch = line.match(/^([A-Z]\d+)/i)
    if (!unitMatch) continue

    const unit = unitMatch[1]
    
    // Try to extract data - this is a simplified parser
    // For better results, we'll use a more sophisticated approach
    const row = parseRowData(line, unit)
    if (row) {
      rows.push(row)
    }
  }

  return rows
}

/**
 * Parse a single row of data from text
 * This is a simplified parser - for production, consider using OCR or more sophisticated parsing
 */
function parseRowData(line: string, unit: string): ParsedTableRow | null {
  // Split by multiple spaces or tabs
  const parts = line.split(/\s{2,}|\t/).filter(p => p.trim().length > 0)
  
  if (parts.length < 3) return null

  const row: ParsedTableRow = {
    unit: unit,
    names: parts[1] || '',
  }

  // Try to extract numbers - this is a heuristic approach
  // In a real scenario, you'd want column positions from the header
  let numIndex = 2
  const numbers: number[] = []

  for (let i = numIndex; i < parts.length; i++) {
    const num = parseFloat(parts[i].replace(/[^\d.-]/g, ''))
    if (!isNaN(num)) {
      numbers.push(num)
    }
  }

  // Assign numbers based on expected positions
  // This is a simplified mapping - adjust based on actual PDF structure
  if (numbers.length >= 2) {
    row.waterSept = numbers[0]
    row.waterOct = numbers[1]
  }
  if (numbers.length >= 4) {
    row.electricitySept = numbers[2]
    row.electricityOct = numbers[3]
  }
  if (numbers.length >= 6) {
    row.rentArrears = numbers[4]
    row.garbageFee = numbers[5]
  }
  if (numbers.length >= 7) {
    row.total = numbers[6]
  }
  if (numbers.length >= 8) {
    row.paid = numbers[7]
  }
  if (numbers.length >= 9) {
    row.due = numbers[8]
  }

  return row
}

/**
 * Advanced PDF table extraction using text positioning
 * This attempts to extract table data by analyzing text positions
 */
async function extractTableFromPDF(file: File): Promise<ParsedTableRow[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const allRows: ParsedTableRow[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    
    // Group text items by Y position (rows) with tolerance for slight variations
    const rows: { [key: number]: any[] } = {}
    const yTolerance = 2 // pixels
    
    textContent.items.forEach((item: any) => {
      const y = Math.round(item.transform[5] / yTolerance) * yTolerance // Round to nearest tolerance
      if (!rows[y]) rows[y] = []
      rows[y].push(item)
    })

    // Sort rows by Y position (top to bottom)
    const sortedYPositions = Object.keys(rows)
      .map(Number)
      .sort((a, b) => b - a) // Top to bottom

    // Find header row
    let headerRowIndex = -1
    for (let i = 0; i < sortedYPositions.length; i++) {
      const rowItems = rows[sortedYPositions[i]]
      const rowText = rowItems.map((item: any) => item.str).join(' ').toLowerCase()
      if (rowText.includes('unit') && (rowText.includes('name') || rowText.includes('water') || rowText.includes('electricity'))) {
        headerRowIndex = i
        break
      }
    }

    // Extract column positions from header if found
    const columnPositions: number[] = []
    if (headerRowIndex >= 0) {
      const headerItems = rows[sortedYPositions[headerRowIndex]]
      headerItems.forEach((item: any) => {
        columnPositions.push(item.transform[4]) // X position
      })
      columnPositions.sort((a, b) => a - b)
    }

    // Parse data rows
    const dataStartIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 0
    for (let i = dataStartIndex; i < sortedYPositions.length; i++) {
      const rowItems = rows[sortedYPositions[i]]
      const rowText = rowItems.map((item: any) => item.str).join(' ')
      
      // Check if this looks like a data row (starts with unit identifier like A1, A2, etc.)
      const unitMatch = rowText.match(/\b([A-Z]\d+)\b/i)
      if (!unitMatch) continue

      const unit = unitMatch[1]
      const row = parseRowFromPositionedText(rowItems, columnPositions, unit, rowText)
      if (row && row.names) {
        allRows.push(row)
      }
    }
  }

  return allRows
}

/**
 * Parse a row from positioned text items
 */
function parseRowFromPositionedText(
  items: any[],
  _columnPositions: number[],
  unit: string,
  _fullRowText: string
): ParsedTableRow | null {
  // Sort items by X position
  const sortedItems = [...items].sort((a, b) => a.transform[4] - b.transform[4])
  
  const row: ParsedTableRow = {
    unit: unit,
    names: '',
  }

  // Extract all text values with their positions
  const textWithPositions: Array<{ text: string; x: number }> = []
  sortedItems.forEach((item: any) => {
    textWithPositions.push({
      text: item.str,
      x: item.transform[4]
    })
  })

  // Try to extract names (usually comes after unit, before numbers)
  // Look for text that contains letters and possibly phone numbers
  let namesStartIdx = -1
  for (let i = 0; i < textWithPositions.length; i++) {
    const text = textWithPositions[i].text.trim()
    // Skip unit identifier
    if (text === unit) {
      namesStartIdx = i + 1
      break
    }
  }

  // Extract names field (can span multiple items)
  const nameParts: string[] = []
  if (namesStartIdx >= 0) {
    for (let i = namesStartIdx; i < textWithPositions.length; i++) {
      const text = textWithPositions[i].text.trim()
      // Stop when we hit a number that looks like a reading
      if (/^\d+\.?\d*$/.test(text) && parseFloat(text) > 0) {
        break
      }
      if (text.length > 0) {
        nameParts.push(text)
      }
    }
  }
  row.names = nameParts.join(' ').trim()

  // Extract all numbers from the row
  const numbers: number[] = []
  for (let i = 0; i < textWithPositions.length; i++) {
    const text = textWithPositions[i].text.trim()
    // Try to parse as number (handles decimals, negatives, etc.)
    const num = parseFloat(text.replace(/[^\d.-]/g, ''))
    if (!isNaN(num) && text.match(/[\d.-]/)) {
      numbers.push(num)
    }
  }

  // Map numbers to fields based on expected positions from the image
  // Format: Water Sept, Water Oct, Water Units, Water Rate, Amount Water,
  //         Electricity Sept, Electricity Oct, Elect Units, Rate Electricity, Amount Power,
  //         Rent & Arrears, Garbage, Total, Paid, Due
  let numIdx = 0
  
  // Water readings (usually first numbers after names)
  if (numbers.length > numIdx) row.waterOct = numbers[numIdx++]
  if (numbers.length > numIdx) row.waterSept = numbers[numIdx++]
  // Sometimes order might be reversed, so check which is larger
  if (row.waterOct !== undefined && row.waterSept !== undefined) {
    if (row.waterSept > row.waterOct) {
      // Swap them
      const temp = row.waterSept
      row.waterSept = row.waterOct
      row.waterOct = temp
    }
  }
  
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    // If this looks like a unit count (small number), it's water units
    if (val < 100 && val > 0) {
      row.waterUnits = val
      numIdx++
    }
  }
  
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    // Water rate is usually 160
    if (val === 160 || (val > 100 && val < 200)) {
      row.waterRate = val
      numIdx++
    }
  }
  
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    // Amount water
    if (val > 0 && val < 10000) {
      row.amountWater = val
      numIdx++
    }
  }

  // Electricity readings
  if (numbers.length > numIdx) row.electricityOct = numbers[numIdx++]
  if (numbers.length > numIdx) row.electricitySept = numbers[numIdx++]
  // Check and swap if needed
  if (row.electricityOct !== undefined && row.electricitySept !== undefined) {
    if (row.electricitySept > row.electricityOct) {
      const temp = row.electricitySept
      row.electricitySept = row.electricityOct
      row.electricityOct = temp
    }
  }
  
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    if (val < 100 && val > 0) {
      row.electUnits = val
      numIdx++
    }
  }
  
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    // Electricity rate is usually 35
    if (val === 35 || (val > 20 && val < 50)) {
      row.rateElectricity = val
      numIdx++
    }
  }
  
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    if (val > 0) {
      row.amountPower = val
      numIdx++
    }
  }

  // Rent and other amounts
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    // Rent is usually 10000
    if (val === 10000 || (val > 5000 && val < 20000)) {
      row.rentArrears = val
      numIdx++
    }
  }
  
  if (numbers.length > numIdx) {
    const val = numbers[numIdx]
    // Garbage is usually 100
    if (val === 100 || (val > 0 && val < 500)) {
      row.garbageFee = val
      numIdx++
    }
  }
  
  if (numbers.length > numIdx) row.total = numbers[numIdx++]
  if (numbers.length > numIdx) row.paid = numbers[numIdx++]
  if (numbers.length > numIdx) row.due = numbers[numIdx++]

  return row
}

/**
 * Main function to parse PDF and extract billing data
 */
export async function parsePDFFile(file: File): Promise<ParsedTableRow[]> {
  try {
    // Try advanced extraction first
    const rows = await extractTableFromPDF(file)
    if (rows.length > 0) {
      return rows
    }

    // Fallback to simple text extraction
    const text = await extractTextFromPDF(file)
    return parseTableFromText(text)
  } catch (error: any) {
    throw new Error(`Failed to parse PDF: ${error.message}`)
  }
}

