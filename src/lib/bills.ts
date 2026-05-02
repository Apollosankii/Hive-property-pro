import { supabase } from './supabase'

/**
 * Returns existing bill id for unit + month, or inserts a rent-only stub (utilities zero, optional last readings carried).
 */
export async function ensureAdvanceRentBill(params: {
  unitId: string
  tenantId: string | null | undefined
  targetMonthYyyyMm: string
}): Promise<string> {
  const billingMonth = `${params.targetMonthYyyyMm}-01`

  const { data: existing } = await supabase
    .from('bills')
    .select('id')
    .eq('unit_id', params.unitId)
    .eq('billing_month', billingMonth)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: unit, error: unitErr } = await supabase
    .from('units')
    .select('monthly_rent, tenant_id')
    .eq('id', params.unitId)
    .single()

  if (unitErr || !unit) throw unitErr || new Error('Unit not found')

  const tenantId = params.tenantId || unit.tenant_id
  if (!tenantId) throw new Error('No tenant assigned to this unit; cannot record advance rent.')

  let waterReading = 0
  let elecReading = 0
  const { data: lastBill } = await supabase
    .from('bills')
    .select('water_current_reading, elec_current_reading')
    .eq('unit_id', params.unitId)
    .order('billing_month', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastBill) {
    waterReading = Number(lastBill.water_current_reading) || 0
    elecReading = Number(lastBill.elec_current_reading) || 0
  }

  const stored = localStorage.getItem('app-settings')
  let parsed: any = null
  try {
    parsed = stored ? JSON.parse(stored) : null
  } catch {
    parsed = null
  }
  const waterRate = parsed?.water_rate ?? 50
  const elecRate = parsed?.elec_rate ?? 15

  const insertPayload: Record<string, unknown> = {
    unit_id: params.unitId,
    tenant_id: tenantId,
    billing_month: billingMonth,
    water_prev_reading: waterReading,
    water_current_reading: waterReading,
    water_rate: waterRate,
    elec_prev_reading: elecReading,
    elec_current_reading: elecReading,
    elec_rate: elecRate,
    rent_amount: unit.monthly_rent || 0,
    arrears_brought_forward: 0,
    garbage_amount: 0,
    maintenance_amount: 0,
    other_utilities_amount: 0,
    amount_paid: 0,
    status: 'pending',
  }

  const { data: row, error } = await supabase.from('bills').insert([insertPayload]).select('id').single()
  if (error) throw error
  if (!row?.id) throw new Error('Failed to create advance rent bill')
  return row.id
}
