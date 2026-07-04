import { supabase } from './supabase'

/** Normalize billing month to YYYY-MM-01 for advance_payments.target_month matching. */
export function normalizeBillingMonth(billingMonth: string): string {
  if (!billingMonth) return billingMonth
  // Prefer string parse to avoid timezone shifting the month
  const match = String(billingMonth).match(/^(\d{4})-(\d{2})/)
  if (match) return `${match[1]}-${match[2]}-01`
  const d = new Date(billingMonth)
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
  }
  return billingMonth
}

/** Sync bill status from DB-generated total/balance. */
export async function syncBillStatus(billId: string): Promise<void> {
  const { data: freshBill, error: freshError } = await supabase
    .from('bills')
    .select('total_amount, amount_paid, balance, status')
    .eq('id', billId)
    .single()

  if (freshError || !freshBill) {
    console.warn('Failed to fetch bill for status sync:', freshError)
    return
  }

  const total = freshBill.total_amount || 0
  const paid = freshBill.amount_paid || 0
  const balance = typeof freshBill.balance === 'number' ? freshBill.balance : total - paid
  const EPS = 0.0001
  const computedStatus = balance <= EPS ? 'paid' : paid > 0 ? 'partial' : 'pending'

  if (computedStatus !== freshBill.status) {
    const { error: statusErr } = await supabase
      .from('bills')
      .update({ status: computedStatus })
      .eq('id', billId)
    if (statusErr) console.warn('Failed to sync bill status:', statusErr)
  }
}

/**
 * Apply unapplied advance payment credits for a unit/month onto a bill by
 * increasing amount_paid (not by reducing arrears). Marks advances as applied.
 * Returns the credit amount applied.
 */
export async function applyUnappliedAdvanceCreditsToBill(
  billId: string,
  unitId: string,
  billingMonth: string
): Promise<number> {
  const targetMonth = normalizeBillingMonth(billingMonth)

  const { data: advances, error } = await supabase
    .from('advance_payments')
    .select('id, amount')
    .eq('unit_id', unitId)
    .eq('target_month', targetMonth)
    .is('applied_bill_id', null)

  if (error) throw error
  if (!advances || advances.length === 0) return 0

  const creditTotal = advances.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  if (creditTotal <= 0) return 0

  const { data: bill, error: billErr } = await supabase
    .from('bills')
    .select('amount_paid')
    .eq('id', billId)
    .single()

  if (billErr || !bill) throw billErr || new Error('Bill not found')

  const newAmountPaid = Math.round(((Number(bill.amount_paid) || 0) + creditTotal) * 100) / 100

  const { error: updateErr } = await supabase
    .from('bills')
    .update({ amount_paid: newAmountPaid })
    .eq('id', billId)

  if (updateErr) throw updateErr

  const { error: applyErr } = await supabase
    .from('advance_payments')
    .update({
      applied_bill_id: billId,
      applied_at: new Date().toISOString(),
    })
    .in(
      'id',
      advances.map((row) => row.id)
    )

  if (applyErr) throw applyErr

  await syncBillStatus(billId)
  return creditTotal
}

/**
 * Repair advances already linked to a bill but never added to amount_paid
 * (legacy path only marked applied_bill_id, or applied via negative arrears).
 */
export async function repairLinkedAdvancesOnBill(billId: string): Promise<number> {
  const { data: linked, error: linkedErr } = await supabase
    .from('advance_payments')
    .select('amount')
    .eq('applied_bill_id', billId)

  if (linkedErr) throw linkedErr

  const advanceSum = (linked || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  if (advanceSum <= 0) return 0

  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('amount')
    .eq('bill_id', billId)

  if (payErr) throw payErr

  const paymentsSum = (payments || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const expectedPaid = Math.round((paymentsSum + advanceSum) * 100) / 100

  const { data: bill, error: billErr } = await supabase
    .from('bills')
    .select('amount_paid, arrears_brought_forward')
    .eq('id', billId)
    .single()

  if (billErr || !bill) throw billErr || new Error('Bill not found')

  const currentPaid = Math.round((Number(bill.amount_paid) || 0) * 100) / 100
  if (currentPaid + 0.001 >= expectedPaid) return 0

  const missing = Math.round((expectedPaid - currentPaid) * 100) / 100
  const arrears = Number(bill.arrears_brought_forward) || 0

  // Legacy path reduced arrears by the advance; restore arrears so net balance stays correct
  // when we move the credit onto amount_paid.
  const updates: { amount_paid: number; arrears_brought_forward?: number } = {
    amount_paid: expectedPaid,
  }
  if (arrears < -0.001) {
    updates.arrears_brought_forward = Math.round((arrears + missing) * 100) / 100
  }

  const { error: updateErr } = await supabase.from('bills').update(updates).eq('id', billId)
  if (updateErr) throw updateErr

  await syncBillStatus(billId)
  return missing
}

/** Apply unapplied credits, then repair any linked-but-unpaid advances. */
export async function reconcileAdvanceCreditsForBill(
  billId: string,
  unitId: string,
  billingMonth: string
): Promise<number> {
  const applied = await applyUnappliedAdvanceCreditsToBill(billId, unitId, billingMonth)
  const repaired = await repairLinkedAdvancesOnBill(billId)
  return applied + repaired
}

/**
 * Reconcile advance credits for a list of existing bills (e.g. when Billing loads).
 * Only touches bills that have pending or linked advance payments.
 * Returns total credit amount applied/repaired.
 */
export async function reconcileAdvanceCreditsForBills(
  bills: Array<{ id: string; unit_id: string; billing_month: string }>
): Promise<number> {
  if (!bills.length) return 0

  const unitIds = [...new Set(bills.map((b) => b.unit_id).filter(Boolean))]
  const billIds = bills.map((b) => b.id).filter(Boolean)
  if (unitIds.length === 0 || billIds.length === 0) return 0

  const [{ data: pending, error: pendingErr }, { data: linked, error: linkedErr }] =
    await Promise.all([
      supabase
        .from('advance_payments')
        .select('id, unit_id, target_month, amount')
        .in('unit_id', unitIds)
        .is('applied_bill_id', null),
      supabase
        .from('advance_payments')
        .select('id, amount, applied_bill_id')
        .in('applied_bill_id', billIds),
    ])

  if (pendingErr) throw pendingErr
  if (linkedErr) throw linkedErr

  const needsWork = new Set<string>()

  for (const row of pending || []) {
    const month = normalizeBillingMonth(row.target_month)
    const bill = bills.find(
      (b) =>
        b.unit_id === row.unit_id &&
        normalizeBillingMonth(b.billing_month) === month
    )
    if (bill?.id) needsWork.add(bill.id)
  }

  for (const row of linked || []) {
    if (row.applied_bill_id) needsWork.add(row.applied_bill_id)
  }

  if (needsWork.size === 0) return 0

  let total = 0
  for (const bill of bills) {
    if (!needsWork.has(bill.id)) continue
    try {
      total += await reconcileAdvanceCreditsForBill(
        bill.id,
        bill.unit_id,
        bill.billing_month
      )
    } catch (err) {
      console.warn('Failed to reconcile advance credits for bill', bill.id, err)
    }
  }

  return total
}

/**
 * Apply every unapplied advance payment that has a matching bill, and repair
 * linked advances that never updated amount_paid. Use when opening Payments.
 */
export async function reconcileAllPendingAdvanceCredits(): Promise<number> {
  const { data: pending, error } = await supabase
    .from('advance_payments')
    .select('id, unit_id, target_month')
    .is('applied_bill_id', null)

  if (error) throw error

  let total = 0
  const seenBills = new Set<string>()

  for (const adv of pending || []) {
    const month = normalizeBillingMonth(adv.target_month)
    const { data: bill } = await supabase
      .from('bills')
      .select('id')
      .eq('unit_id', adv.unit_id)
      .eq('billing_month', month)
      .maybeSingle()

    if (!bill?.id || seenBills.has(bill.id)) continue
    seenBills.add(bill.id)

    try {
      total += await reconcileAdvanceCreditsForBill(bill.id, adv.unit_id, month)
    } catch (err) {
      console.warn('Failed to reconcile pending advance for unit', adv.unit_id, err)
    }
  }

  const { data: linked, error: linkedErr } = await supabase
    .from('advance_payments')
    .select('applied_bill_id')
    .not('applied_bill_id', 'is', null)

  if (linkedErr) throw linkedErr

  for (const row of linked || []) {
    const billId = row.applied_bill_id
    if (!billId || seenBills.has(billId)) continue
    seenBills.add(billId)
    try {
      total += await repairLinkedAdvancesOnBill(billId)
    } catch (err) {
      console.warn('Failed to repair linked advances for bill', billId, err)
    }
  }

  return total
}
