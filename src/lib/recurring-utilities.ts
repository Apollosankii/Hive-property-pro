import { supabase } from './supabase'

export interface UtilityTypeLike {
  id: string
  name: string
  rate: number
  is_active?: boolean
  display_order?: number
}

export interface UtilityBillItemLike {
  bill_id: string
  utility_type_id: string
  units_consumed: number
  rate: number
  amount?: number
  utility_types?: { name: string; unit_name?: string; display_order?: number }
}

export interface RecurringLineItem {
  name: string
  amount: number
}

/** Water and electricity are billed via meter readings, not fixed recurring utility types. */
export function isMeterUtility(name: string): boolean {
  const n = name.toLowerCase().trim()
  return (
    n.includes('water') ||
    n.includes('electric') ||
    n.includes('elec') ||
    n.includes('power')
  )
}

export function isRecurringUtility(utility: { name: string }): boolean {
  return !isMeterUtility(utility.name)
}

export function filterRecurringUtilities<T extends { name: string }>(utilities: T[]): T[] {
  return utilities.filter(isRecurringUtility)
}

export function computeUtilityAmounts(utilities: UtilityTypeLike[]) {
  const recurring = filterRecurringUtilities(utilities)
  let garbageAmount = 0
  let maintenanceAmount = 0
  let otherUtilitiesAmount = 0

  for (const utility of recurring) {
    const utilityName = utility.name.toLowerCase().trim()
    const utilityRate = utility.rate || 0

    if (utilityName.includes('garbage') || utilityName.includes('waste') || utilityName.includes('refuse')) {
      garbageAmount += utilityRate
    } else if (utilityName.includes('maintenance')) {
      maintenanceAmount += utilityRate
    } else {
      otherUtilitiesAmount += utilityRate
    }
  }

  return { garbageAmount, maintenanceAmount, otherUtilitiesAmount, recurringUtilities: recurring }
}

export function buildUtilityBillItemRows(
  billId: string,
  utilities: UtilityTypeLike[]
): Array<{ bill_id: string; utility_type_id: string; units_consumed: number; rate: number }> {
  return filterRecurringUtilities(utilities).map((utility) => ({
    bill_id: billId,
    utility_type_id: utility.id,
    units_consumed: 1,
    rate: utility.rate,
  }))
}

function itemAmount(item: UtilityBillItemLike): number {
  if (typeof item.amount === 'number') return item.amount
  return (item.rate || 0) * (item.units_consumed ?? 1)
}

/** Line items for invoice PDF — prefers stored utility_bill_items, falls back to bill columns. */
export function getRecurringLineItems(
  bill: {
    garbage_amount?: number
    maintenance_amount?: number
    other_utilities_amount?: number
    utility_bill_items?: UtilityBillItemLike[]
  },
  activeUtilityTypes?: UtilityTypeLike[]
): RecurringLineItem[] {
  const items = bill.utility_bill_items
  if (items && items.length > 0) {
    return items
      .map((item) => ({
        name: item.utility_types?.name || 'Utility',
        amount: itemAmount(item),
        order: item.utility_types?.display_order ?? 0,
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => a.order - b.order)
      .map(({ name, amount }) => ({ name, amount }))
  }

  const lines: RecurringLineItem[] = []

  if ((bill.garbage_amount || 0) > 0) {
    lines.push({ name: 'Garbage', amount: bill.garbage_amount || 0 })
  }
  if ((bill.maintenance_amount || 0) > 0) {
    lines.push({ name: 'Maintenance', amount: bill.maintenance_amount || 0 })
  }

  const otherAmount = bill.other_utilities_amount || 0
  if (otherAmount > 0) {
    const otherTypes = filterRecurringUtilities(activeUtilityTypes || []).filter((utility) => {
      const n = utility.name.toLowerCase().trim()
      return (
        !n.includes('garbage') &&
        !n.includes('waste') &&
        !n.includes('refuse') &&
        !n.includes('maintenance')
      )
    })

    const expectedOther = otherTypes.reduce((sum, utility) => sum + (utility.rate || 0), 0)
    if (otherTypes.length > 0 && Math.abs(expectedOther - otherAmount) < 0.01) {
      otherTypes
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .forEach((utility) => {
          if ((utility.rate || 0) > 0) {
            lines.push({ name: utility.name, amount: utility.rate || 0 })
          }
        })
    } else {
      lines.push({ name: 'Other Utilities', amount: otherAmount })
    }
  }

  return lines
}

export async function fetchUtilityBillItemsForBill(billId: string): Promise<UtilityBillItemLike[]> {
  const { data, error } = await supabase
    .from('utility_bill_items')
    .select('*, utility_types(name, unit_name, display_order)')
    .eq('bill_id', billId)

  if (error) throw error
  return (data || []) as UtilityBillItemLike[]
}

export async function fetchUtilityBillItemsForBills(
  billIds: string[]
): Promise<Map<string, UtilityBillItemLike[]>> {
  const map = new Map<string, UtilityBillItemLike[]>()
  if (billIds.length === 0) return map

  const { data, error } = await supabase
    .from('utility_bill_items')
    .select('*, utility_types(name, unit_name, display_order)')
    .in('bill_id', billIds)

  if (error) throw error

  for (const item of (data || []) as UtilityBillItemLike[]) {
    const existing = map.get(item.bill_id) || []
    existing.push(item)
    map.set(item.bill_id, existing)
  }

  return map
}

export async function syncUtilityBillItemsForBill(
  billId: string,
  utilities: UtilityTypeLike[]
): Promise<void> {
  await supabase.from('utility_bill_items').delete().eq('bill_id', billId)

  const rows = buildUtilityBillItemRows(billId, utilities)
  if (rows.length === 0) return

  const { error } = await supabase.from('utility_bill_items').insert(rows)
  if (error) throw error
}
