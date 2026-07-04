/** Bill fields needed to compute a tenant's current account position. */
export type BillBalanceLike = {
  id?: string
  unit_id?: string | null
  billing_month?: string | null
  balance?: number | null
  total_amount?: number | null
  amount_paid?: number | null
  arrears_brought_forward?: number | null
  status?: string | null
}

function monthKey(billingMonth?: string | null): string {
  if (!billingMonth) return ''
  const match = String(billingMonth).match(/^(\d{4})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}`
  const d = new Date(billingMonth)
  if (Number.isNaN(d.getTime())) return String(billingMonth)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Latest bill per unit. Arrears are carried forward on new bills, so summing
 * every historical balance double-counts what the tenant owes.
 */
export function getLatestBillsByUnit(bills: BillBalanceLike[]): BillBalanceLike[] {
  const latestByUnit = new Map<string, BillBalanceLike>()

  for (const bill of bills || []) {
    const unitKey = bill.unit_id || '__none__'
    const existing = latestByUnit.get(unitKey)
    if (!existing) {
      latestByUnit.set(unitKey, bill)
      continue
    }
    if (monthKey(bill.billing_month) > monthKey(existing.billing_month)) {
      latestByUnit.set(unitKey, bill)
    }
  }

  return Array.from(latestByUnit.values())
}

export type TenantAccountSummary = {
  /** Net position: positive = amount owed, negative = credit/overpayment */
  currentBalance: number
  /** Outstanding on latest bill(s) only (before pending advances) */
  outstandingOnBills: number
  /** Unapplied advance payment credits */
  pendingAdvanceCredit: number
  /** Positive amount currently owed */
  amountOwed: number
  /** Positive credit balance (overpayment / unapplied advances) */
  creditBalance: number
  /** Lifetime payments recorded */
  totalPaid: number
  /** Charges on latest bill(s), excluding carried arrears */
  latestCharges: number
  /** Paid toward latest bill(s) */
  latestPaid: number
  latestBillingMonth: string | null
  openBillsCount: number
}

/**
 * Tenant payment / account summary used across tenant detail, lists, and payments.
 */
export function computeTenantAccountSummary(
  bills: BillBalanceLike[],
  payments?: Array<{ amount?: number | null }>,
  pendingAdvanceCredit: number = 0
): TenantAccountSummary {
  const latestBills = getLatestBillsByUnit(bills || [])

  const outstandingOnBills = latestBills.reduce(
    (sum, bill) => sum + (Number(bill.balance) || 0),
    0
  )

  const pendingCredit = Math.max(0, Number(pendingAdvanceCredit) || 0)
  const currentBalance = Math.round((outstandingOnBills - pendingCredit) * 100) / 100

  const latestCharges = latestBills.reduce((sum, bill) => {
    const total = Number(bill.total_amount) || 0
    const arrears = Number(bill.arrears_brought_forward) || 0
    // Prefer explicit charges when available; fall back to total
    const charges = total - arrears
    return sum + (Number.isFinite(charges) ? charges : total)
  }, 0)

  const latestPaid = latestBills.reduce(
    (sum, bill) => sum + (Number(bill.amount_paid) || 0),
    0
  )

  const totalPaid = (payments || []).reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0
  )

  const openBillsCount = latestBills.filter((bill) => (Number(bill.balance) || 0) > 0.001).length

  const months = latestBills
    .map((bill) => monthKey(bill.billing_month))
    .filter(Boolean)
    .sort()
  const latestBillingMonth = months.length > 0 ? months[months.length - 1] : null

  return {
    currentBalance,
    outstandingOnBills: Math.round(outstandingOnBills * 100) / 100,
    pendingAdvanceCredit: Math.round(pendingCredit * 100) / 100,
    amountOwed: Math.max(0, currentBalance),
    creditBalance: Math.max(0, -currentBalance),
    totalPaid: Math.round(totalPaid * 100) / 100,
    latestCharges: Math.round(latestCharges * 100) / 100,
    latestPaid: Math.round(latestPaid * 100) / 100,
    latestBillingMonth,
    openBillsCount,
  }
}

/** Convenience for list views that only need the net balance figure. */
export function computeCurrentBalance(
  bills: BillBalanceLike[],
  pendingAdvanceCredit: number = 0
): number {
  return computeTenantAccountSummary(bills, undefined, pendingAdvanceCredit).currentBalance
}
