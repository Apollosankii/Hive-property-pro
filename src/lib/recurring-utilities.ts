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

export interface BillUtilityLineItem {
  utility_type_id: string
  name: string
  amount: number
  display_order?: number
}

function bucketAmountByName(name: string, amount: number): {
  garbage: number
  maintenance: number
  other: number
} {
  const n = name.toLowerCase().trim()
  if (n.includes('garbage') || n.includes('waste') || n.includes('refuse')) {
    return { garbage: amount, maintenance: 0, other: 0 }
  }
  if (n.includes('maintenance')) {
    return { garbage: 0, maintenance: amount, other: 0 }
  }
  return { garbage: 0, maintenance: 0, other: amount }
}

export function lineItemsFromUtilityTypes(
  types: UtilityTypeLike[],
  amountsById?: Record<string, number>
): BillUtilityLineItem[] {
  return filterRecurringUtilities(types)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((utility) => ({
      utility_type_id: utility.id,
      name: utility.name,
      amount: amountsById?.[utility.id] ?? utility.rate ?? 0,
      display_order: utility.display_order,
    }))
}

export function lineItemsFromBillItems(items: UtilityBillItemLike[]): BillUtilityLineItem[] {
  return items
    .map((item) => ({
      utility_type_id: item.utility_type_id,
      name: item.utility_types?.name || 'Utility',
      amount: itemAmount(item),
      display_order: item.utility_types?.display_order,
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
}

export function lineItemsFromLegacyBill(
  bill: {
    garbage_amount?: number
    maintenance_amount?: number
    other_utilities_amount?: number
  },
  types: UtilityTypeLike[]
): BillUtilityLineItem[] {
  const recurring = filterRecurringUtilities(types).sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  )
  const garbageTypes = recurring.filter((u) => bucketAmountByName(u.name, 1).garbage > 0)
  const maintenanceTypes = recurring.filter((u) => bucketAmountByName(u.name, 1).maintenance > 0)
  const otherTypes = recurring.filter((u) => bucketAmountByName(u.name, 1).other > 0)

  const lines: BillUtilityLineItem[] = []

  if ((bill.garbage_amount || 0) > 0) {
    if (garbageTypes.length === 1) {
      lines.push({
        utility_type_id: garbageTypes[0].id,
        name: garbageTypes[0].name,
        amount: bill.garbage_amount || 0,
        display_order: garbageTypes[0].display_order,
      })
    } else if (garbageTypes.length > 1) {
      garbageTypes.forEach((u) => {
        if ((u.rate || 0) > 0) {
          lines.push({
            utility_type_id: u.id,
            name: u.name,
            amount: u.rate || 0,
            display_order: u.display_order,
          })
        }
      })
    } else {
      lines.push({
        utility_type_id: '__legacy_garbage__',
        name: 'Garbage',
        amount: bill.garbage_amount || 0,
      })
    }
  }

  if ((bill.maintenance_amount || 0) > 0) {
    if (maintenanceTypes.length === 1) {
      lines.push({
        utility_type_id: maintenanceTypes[0].id,
        name: maintenanceTypes[0].name,
        amount: bill.maintenance_amount || 0,
        display_order: maintenanceTypes[0].display_order,
      })
    } else if (maintenanceTypes.length > 1) {
      maintenanceTypes.forEach((u) => {
        if ((u.rate || 0) > 0) {
          lines.push({
            utility_type_id: u.id,
            name: u.name,
            amount: u.rate || 0,
            display_order: u.display_order,
          })
        }
      })
    } else {
      lines.push({
        utility_type_id: '__legacy_maintenance__',
        name: 'Maintenance',
        amount: bill.maintenance_amount || 0,
      })
    }
  }

  const otherAmount = bill.other_utilities_amount || 0
  if (otherAmount > 0) {
    const expectedOther = otherTypes.reduce((sum, u) => sum + (u.rate || 0), 0)
    if (otherTypes.length > 0 && Math.abs(expectedOther - otherAmount) < 0.01) {
      otherTypes.forEach((u) => {
        if ((u.rate || 0) > 0) {
          lines.push({
            utility_type_id: u.id,
            name: u.name,
            amount: u.rate || 0,
            display_order: u.display_order,
          })
        }
      })
    } else if (otherTypes.length === 1) {
      lines.push({
        utility_type_id: otherTypes[0].id,
        name: otherTypes[0].name,
        amount: otherAmount,
        display_order: otherTypes[0].display_order,
      })
    } else {
      lines.push({
        utility_type_id: '__legacy_other__',
        name: 'Other Utilities',
        amount: otherAmount,
      })
    }
  }

  return lines
}

export function deriveBillUtilityColumns(lineItems: BillUtilityLineItem[]) {
  let garbageAmount = 0
  let maintenanceAmount = 0
  let otherUtilitiesAmount = 0

  for (const item of lineItems) {
    const amount = item.amount || 0
    if (amount <= 0) continue
    const bucket = bucketAmountByName(item.name, amount)
    garbageAmount += bucket.garbage
    maintenanceAmount += bucket.maintenance
    otherUtilitiesAmount += bucket.other
  }

  return { garbageAmount, maintenanceAmount, otherUtilitiesAmount }
}

export function utilityLineItemsSubtotal(lineItems: BillUtilityLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + (item.amount > 0 ? item.amount : 0), 0)
}

export function buildUtilityBillItemRowsFromLineItems(
  billId: string,
  lineItems: BillUtilityLineItem[]
): Array<{ bill_id: string; utility_type_id: string; units_consumed: number; rate: number }> {
  return lineItems
    .filter((item) => item.amount > 0 && !item.utility_type_id.startsWith('__legacy_'))
    .map((item) => ({
      bill_id: billId,
      utility_type_id: item.utility_type_id,
      units_consumed: 1,
      rate: item.amount,
    }))
}

export async function syncUtilityBillItemsFromLineItems(
  billId: string,
  lineItems: BillUtilityLineItem[]
): Promise<void> {
  await supabase.from('utility_bill_items').delete().eq('bill_id', billId)

  const rows = buildUtilityBillItemRowsFromLineItems(billId, lineItems)
  if (rows.length === 0) return

  const { error } = await supabase.from('utility_bill_items').insert(rows)
  if (error) throw error
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
