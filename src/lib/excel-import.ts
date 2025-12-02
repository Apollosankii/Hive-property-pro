import * as XLSX from 'xlsx'
import { supabase } from './supabase'

export interface ImportedTenant {
  unit: string
  name: string
  phone: string
  email?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relationship?: string
}

export interface ImportedBill {
  unit: string
  tenant_name: string
  tenant_phone: string
  billing_month: string // YYYY-MM-01 format
  water_prev_reading: number
  water_current_reading: number
  water_rate: number
  elec_prev_reading: number
  elec_current_reading: number
  elec_rate: number
  rent_amount: number
  garbage_amount: number
  arrears_brought_forward: number
  amount_paid: number
}

// Parse Excel file and extract data
export function parseExcelFile(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        resolve(workbook)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// Import tenants from Excel
// Expected format: Unit, Names (name and phone), Email (optional)
export async function importTenantsFromExcel(
  file: File,
  onProgress?: (progress: number, message: string) => void
): Promise<{ success: number; errors: string[] }> {
  try {
    const workbook = await parseExcelFile(file)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][]

    if (data.length < 2) {
      throw new Error('Excel file must have at least a header row and one data row')
    }

    // Find header row (usually first row)
    const headerRow = data[0].map((h: any) => String(h || '').toLowerCase().trim())
    
    // Find column indices
    const unitIndex = headerRow.findIndex((h: string) => 
      h.includes('unit') || h.includes('room') || h.includes('apartment')
    )
    const nameIndex = headerRow.findIndex((h: string) => 
      h.includes('name') || h.includes('tenant') || h.includes('names')
    )
    const phoneIndex = headerRow.findIndex((h: string) => 
      h.includes('phone') || h.includes('contact') || h.includes('mobile')
    )
    const emailIndex = headerRow.findIndex((h: string) => 
      h.includes('email') || h.includes('e-mail')
    )
    const emergencyNameIndex = headerRow.findIndex((h: string) => 
      h.includes('emergency') && h.includes('name')
    )
    const emergencyPhoneIndex = headerRow.findIndex((h: string) => 
      h.includes('emergency') && h.includes('phone')
    )
    const emergencyRelationshipIndex = headerRow.findIndex((h: string) => 
      h.includes('emergency') && (h.includes('relationship') || h.includes('relation'))
    )

    if (unitIndex === -1 || nameIndex === -1) {
      throw new Error('Could not find Unit and Name columns in Excel file')
    }

    const errors: string[] = []
    let success = 0

    // Get all units to match unit numbers
    const { data: units } = await supabase.from('units').select('id, unit_number, building_id, buildings(name)')

    // Process data rows (skip header)
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.every((cell: any) => !cell)) continue // Skip empty rows

      try {
        const unitText = String(row[unitIndex] || '').trim()
        const nameText = String(row[nameIndex] || '').trim()
        
        if (!unitText || !nameText) {
          errors.push(`Row ${i + 1}: Missing unit or name`)
          continue
        }

        // Parse name and phone from "Names" column (format: "Name Phone" or "Name")
        let tenantName = nameText
        let tenantPhone = ''
        
        if (phoneIndex !== -1 && row[phoneIndex]) {
          tenantPhone = String(row[phoneIndex]).trim()
        } else {
          // Try to extract phone from name field (e.g., "Alex Mbugua 0799-465214")
          const phoneMatch = nameText.match(/(\d{3,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4})/)
          if (phoneMatch) {
            tenantPhone = phoneMatch[1].replace(/[-.\s]/g, '-')
            tenantName = nameText.replace(phoneMatch[0], '').trim()
          }
        }

        if (!tenantPhone) {
          errors.push(`Row ${i + 1}: Missing phone number`)
          continue
        }

        // Find matching unit
        const unitParts = unitText.split(/[-_\s]/)
        const unitNumber = unitParts[unitParts.length - 1] // Get last part (e.g., "A1" from "Building A-A1")
        
        const matchingUnit = units?.find((u: any) => {
          const uNum = String(u.unit_number || '').toUpperCase()
          return uNum === unitNumber.toUpperCase() || uNum.includes(unitNumber.toUpperCase())
        })

        if (!matchingUnit) {
          errors.push(`Row ${i + 1}: Unit "${unitText}" not found. Please create the unit first.`)
          continue
        }

        // Check if tenant already exists
        const { data: existingTenant } = await supabase
          .from('tenants')
          .select('id')
          .eq('phone', tenantPhone)
          .single()

        if (existingTenant) {
          // Update existing tenant
          const { error: updateError } = await supabase
            .from('tenants')
            .update({
              name: tenantName,
              email: emailIndex !== -1 ? String(row[emailIndex] || '').trim() || undefined : undefined,
              unit_id: matchingUnit.id,
              emergency_contact_name: emergencyNameIndex !== -1 ? String(row[emergencyNameIndex] || '').trim() || undefined : undefined,
              emergency_contact_phone: emergencyPhoneIndex !== -1 ? String(row[emergencyPhoneIndex] || '').trim() || undefined : undefined,
              emergency_contact_relationship: emergencyRelationshipIndex !== -1 ? String(row[emergencyRelationshipIndex] || '').trim() || undefined : undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingTenant.id)

          if (updateError) throw updateError
          
          // Update unit status
          await supabase
            .from('units')
            .update({ tenant_id: existingTenant.id, status: 'occupied' })
            .eq('id', matchingUnit.id)
        } else {
          // Create new tenant
          const { data: newTenant, error: createError } = await supabase
            .from('tenants')
            .insert([{
              name: tenantName,
              phone: tenantPhone,
              email: emailIndex !== -1 ? String(row[emailIndex] || '').trim() || undefined : undefined,
              unit_id: matchingUnit.id,
              emergency_contact_name: emergencyNameIndex !== -1 ? String(row[emergencyNameIndex] || '').trim() || undefined : undefined,
              emergency_contact_phone: emergencyPhoneIndex !== -1 ? String(row[emergencyPhoneIndex] || '').trim() || undefined : undefined,
              emergency_contact_relationship: emergencyRelationshipIndex !== -1 ? String(row[emergencyRelationshipIndex] || '').trim() || undefined : undefined,
              status: 'active',
            }])
            .select()
            .single()

          if (createError) throw createError

          // Update unit status
          await supabase
            .from('units')
            .update({ tenant_id: newTenant.id, status: 'occupied' })
            .eq('id', matchingUnit.id)
        }

        success++
        if (onProgress) {
          onProgress((i / (data.length - 1)) * 100, `Processing row ${i + 1}...`)
        }
      } catch (error: any) {
        errors.push(`Row ${i + 1}: ${error.message || 'Unknown error'}`)
      }
    }

    return { success, errors }
  } catch (error: any) {
    throw new Error(`Failed to import tenants: ${error.message}`)
  }
}

// Import bills from Excel (based on the image format)
// Expected format matches the billing statement shown
export async function importBillsFromExcel(
  file: File,
  billingMonth: string, // YYYY-MM format
  onProgress?: (progress: number, message: string) => void
): Promise<{ success: number; errors: string[] }> {
  try {
    const workbook = await parseExcelFile(file)
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][]

    if (data.length < 2) {
      throw new Error('Excel file must have at least a header row and one data row')
    }

    // Find header row
    const headerRow = data[0].map((h: any) => String(h || '').toLowerCase().trim())
    
    // Find column indices based on the image format
    const unitIndex = headerRow.findIndex((h: string) => 
      h.includes('unit') || h.includes('room')
    )
    const waterPrevIndex = headerRow.findIndex((h: string) => 
      (h.includes('water') && (h.includes('sept') || h.includes('prev') || h.includes('previous'))) ||
      h.includes('water sept')
    )
    const waterCurrIndex = headerRow.findIndex((h: string) => 
      (h.includes('water') && (h.includes('oct') || h.includes('curr') || h.includes('current'))) ||
      h.includes('water oct')
    )
    const waterUnitsIndex = headerRow.findIndex((h: string) => 
      h.includes('water') && h.includes('unit')
    )
    const waterRateIndex = headerRow.findIndex((h: string) => 
      h.includes('water') && h.includes('rate')
    )
    const waterAmountIndex = headerRow.findIndex((h: string) => 
      h.includes('water') && h.includes('amount')
    )
    const elecPrevIndex = headerRow.findIndex((h: string) => 
      (h.includes('electricity') || h.includes('elect') || h.includes('power')) && 
      (h.includes('sept') || h.includes('prev') || h.includes('previous'))
    )
    const elecCurrIndex = headerRow.findIndex((h: string) => 
      (h.includes('electricity') || h.includes('elect') || h.includes('power')) && 
      (h.includes('oct') || h.includes('curr') || h.includes('current'))
    )
    const elecUnitsIndex = headerRow.findIndex((h: string) => 
      (h.includes('electricity') || h.includes('elect') || h.includes('power')) && h.includes('unit')
    )
    const elecRateIndex = headerRow.findIndex((h: string) => 
      (h.includes('electricity') || h.includes('elect') || h.includes('power')) && h.includes('rate')
    )
    const elecAmountIndex = headerRow.findIndex((h: string) => 
      (h.includes('electricity') || h.includes('elect') || h.includes('power')) && h.includes('amount')
    )
    const rentIndex = headerRow.findIndex((h: string) => 
      h.includes('rent') || (h.includes('arrears') && h.includes('fee'))
    )
    const garbageIndex = headerRow.findIndex((h: string) => 
      h.includes('garbage') || h.includes('trash')
    )
    const totalIndex = headerRow.findIndex((h: string) => 
      h.includes('total')
    )
    const paidIndex = headerRow.findIndex((h: string) => 
      h.includes('paid')
    )

    if (unitIndex === -1) {
      throw new Error('Could not find Unit column in Excel file')
    }

    const errors: string[] = []
    let success = 0

    // Get all units and tenants
    const { data: units } = await supabase
      .from('units')
      .select('id, unit_number, building_id, buildings(name), tenant_id, tenants(id, name, phone)')

    // Process data rows
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || row.every((cell: any) => !cell)) continue

      try {
        const unitText = String(row[unitIndex] || '').trim()
        if (!unitText) continue

        // Find matching unit
        const unitParts = unitText.split(/[-_\s]/)
        const unitNumber = unitParts[unitParts.length - 1]
        
        const matchingUnit = units?.find((u: any) => {
          const uNum = String(u.unit_number || '').toUpperCase()
          return uNum === unitNumber.toUpperCase() || uNum.includes(unitNumber.toUpperCase())
        })

        if (!matchingUnit) {
          errors.push(`Row ${i + 1}: Unit "${unitText}" not found`)
          continue
        }

        if (!matchingUnit.tenant_id || !matchingUnit.tenants) {
          errors.push(`Row ${i + 1}: Unit "${unitText}" has no tenant assigned`)
          continue
        }

        // Parse readings and amounts
        const parseNumber = (val: any, defaultValue = 0) => {
          if (val === null || val === undefined || val === '') return defaultValue
          const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.-]/g, ''))
          return isNaN(num) ? defaultValue : num
        }

        const waterPrev = waterPrevIndex !== -1 ? parseNumber(row[waterPrevIndex]) : 0
        const waterCurr = waterCurrIndex !== -1 ? parseNumber(row[waterCurrIndex]) : 0
        const waterUnits = waterUnitsIndex !== -1 
          ? parseNumber(row[waterUnitsIndex]) 
          : Math.max(0, waterCurr - waterPrev)
        const waterRate = waterRateIndex !== -1 ? parseNumber(row[waterRateIndex], 160) : 160
        const waterAmount = waterAmountIndex !== -1 
          ? parseNumber(row[waterAmountIndex]) 
          : waterUnits * waterRate

        const elecPrev = elecPrevIndex !== -1 ? parseNumber(row[elecPrevIndex]) : 0
        const elecCurr = elecCurrIndex !== -1 ? parseNumber(row[elecCurrIndex]) : 0
        const elecUnits = elecUnitsIndex !== -1 
          ? parseNumber(row[elecUnitsIndex]) 
          : Math.max(0, elecCurr - elecPrev)
        const elecRate = elecRateIndex !== -1 ? parseNumber(row[elecRateIndex], 35) : 35
        const elecAmount = elecAmountIndex !== -1 
          ? parseNumber(row[elecAmountIndex]) 
          : elecUnits * elecRate

        const rentAmount = rentIndex !== -1 ? parseNumber(row[rentIndex], 0) : 0
        const garbageAmount = garbageIndex !== -1 ? parseNumber(row[garbageIndex], 0) : 0
        const totalAmount = totalIndex !== -1 ? parseNumber(row[totalIndex]) : 0
        const amountPaid = paidIndex !== -1 ? parseNumber(row[paidIndex], 0) : 0

        // Calculate arrears (if total is provided, arrears = total - water - elec - rent - garbage)
        // Otherwise, assume it's included in rent or calculate from balance
        const calculatedTotal = waterAmount + elecAmount + rentAmount + garbageAmount
        const arrearsBroughtForward = totalAmount > calculatedTotal 
          ? totalAmount - calculatedTotal 
          : 0

        // Check if bill already exists for this month
        const { data: existingBill } = await supabase
          .from('bills')
          .select('id')
          .eq('unit_id', matchingUnit.id)
          .eq('billing_month', `${billingMonth}-01`)
          .single()

        const billData = {
          unit_id: matchingUnit.id,
          tenant_id: matchingUnit.tenant_id,
          billing_month: `${billingMonth}-01`,
          water_prev_reading: waterPrev,
          water_current_reading: waterCurr,
          water_rate: waterRate,
          elec_prev_reading: elecPrev,
          elec_current_reading: elecCurr,
          elec_rate: elecRate,
          rent_amount: rentAmount,
          garbage_amount: garbageAmount,
          arrears_brought_forward: arrearsBroughtForward,
          amount_paid: amountPaid,
        }

        if (existingBill) {
          // Update existing bill
          const { error: updateError } = await supabase
            .from('bills')
            .update(billData)
            .eq('id', existingBill.id)

          if (updateError) throw updateError
        } else {
          // Create new bill
          const { error: createError } = await supabase
            .from('bills')
            .insert([billData])

          if (createError) throw createError
        }

        success++
        if (onProgress) {
          onProgress((i / (data.length - 1)) * 100, `Processing row ${i + 1}...`)
        }
      } catch (error: any) {
        errors.push(`Row ${i + 1}: ${error.message || 'Unknown error'}`)
      }
    }

    return { success, errors }
  } catch (error: any) {
    throw new Error(`Failed to import bills: ${error.message}`)
  }
}

