import { supabase } from './supabase'

export type BuildingPaymentRow = {
  payment_method_label?: string | null
  payment_paybill?: string | null
  payment_account_number?: string | null
  payment_notes?: string | null
} | null

export type GlobalPaymentSettings = {
  payment_method?: string
  paybill?: string
  account_number?: string
}

export function readGlobalPaymentSettings(): GlobalPaymentSettings {
  const stored = localStorage.getItem('app-settings')
  let parsed: any = null
  try {
    parsed = stored ? JSON.parse(stored) : null
  } catch {
    parsed = null
  }
  return {
    payment_method: parsed?.payment_method ?? '',
    paybill: parsed?.paybill ?? '',
    account_number: parsed?.account_number ?? '',
  }
}

export function buildingHasPaymentOverride(b: BuildingPaymentRow): boolean {
  if (!b) return false
  return [b.payment_method_label, b.payment_paybill, b.payment_account_number, b.payment_notes].some(
    (x) => x != null && String(x).trim() !== ''
  )
}

/** When the building has any override field set, merge each slot as building-first then global. */
export function resolvePaymentInstructions(
  building: BuildingPaymentRow,
  global: GlobalPaymentSettings
): { method: string; paybill: string; account: string; notes: string } {
  const g = global || {}
  if (!buildingHasPaymentOverride(building)) {
    return {
      method: (g.payment_method || '').toString(),
      paybill: (g.paybill || '').toString(),
      account: (g.account_number || '').toString(),
      notes: '',
    }
  }
  const b = building!
  return {
    method: (b.payment_method_label?.trim() || g.payment_method || '').toString(),
    paybill: (b.payment_paybill?.trim() || g.paybill || '').toString(),
    account: (b.payment_account_number?.trim() || g.account_number || '').toString(),
    notes: (b.payment_notes?.trim() || '').toString(),
  }
}

export async function fetchBuildingPaymentByUnitId(unitId: string): Promise<BuildingPaymentRow> {
  const { data: u } = await supabase.from('units').select('building_id').eq('id', unitId).maybeSingle()
  if (!u?.building_id) return null
  const { data: b } = await supabase
    .from('buildings')
    .select('payment_method_label, payment_paybill, payment_account_number, payment_notes')
    .eq('id', u.building_id)
    .maybeSingle()
  return b
}
