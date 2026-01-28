import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, SecurityDeposit } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Shield, AlertCircle, X, FileText, Loader, Download, Printer, Edit2 } from 'lucide-react'

interface SettlementReceipt {
  tenantName: string
  tenantPhone: string
  unitNumber: string
  buildingName: string
  leaseEndDate: string
  depositAmount: number
  existingDeductions: number
  arrears: number
  damages: number
  totalDeductions: number
  refundAmount: number
  damagesDescription: string
  settlementNotes: string
  unpaidBills: Array<{
    month: string
    rent: number
    water: number
    electricity: number
    balance: number
  }>
  meterWaterDeduction?: number
  meterElecDeduction?: number
}

export default function SecurityDeposits() {
  const [selectedDeposit, setSelectedDeposit] = useState<SecurityDeposit | null>(null)
  const [showLeaseEndModal, setShowLeaseEndModal] = useState(false)
  const [isEditingLeaseEnd, setIsEditingLeaseEnd] = useState(false)
  const [damagesAmount, setDamagesAmount] = useState('')
  const [damagesDescription, setDamagesDescription] = useState('')
  const [finalWaterReading, setFinalWaterReading] = useState('')
  const [finalElecReading, setFinalElecReading] = useState('')
  const [meterWaterRate, setMeterWaterRate] = useState('50')
  const [meterElecRate, setMeterElecRate] = useState('15')
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [leaseEndTenantBills, setLeaseEndTenantBills] = useState<any[]>([])
  const [loadingBills, setLoadingBills] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [settlementReceipt, setSettlementReceipt] = useState<SettlementReceipt | null>(null)
  const queryClient = useQueryClient()

  // Load meter rates from settings on component mount
  useEffect(() => {
    const stored = localStorage.getItem('app-settings')
    if (stored) {
      try {
        const settings = JSON.parse(stored)
        if (settings.water_rate) setMeterWaterRate(settings.water_rate.toString())
        if (settings.elec_rate) setMeterElecRate(settings.elec_rate.toString())
      } catch (e) {
        console.warn('Failed to parse settings:', e)
      }
    }
  }, [])

  const { data: deposits, error: depositsError, isLoading: depositsLoading } = useQuery({
    queryKey: ['security-deposits'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      const { data, error } = await supabase
        .from('security_deposits')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error

      // Fetch related data and normalize unit/building shape
      const depositsWithRelations = await Promise.all(
        (data || []).map(async (deposit: any) => {
          const [tenantRes, unitRes] = await Promise.all([
            supabase
              .from('tenants')
              .select('name, phone')
              .eq('id', deposit.tenant_id)
              .single(),
            deposit.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', deposit.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])

          // Resolve building name if available
          let buildingName = null
          if (unitRes.data?.building_id) {
            const { data: buildingData } = await supabase
              .from('buildings')
              .select('name')
              .eq('id', unitRes.data.building_id)
              .single()
            buildingName = buildingData?.name || null
          }

          return {
            ...deposit,
            tenants: tenantRes.data,
            units: unitRes.data
              ? { unit_number: unitRes.data.unit_number, buildings: buildingName ? { name: buildingName } : null }
              : null,
          }
        })
      )

      return depositsWithRelations
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: deductions } = useQuery({
    queryKey: ['security-deposit-deductions', selectedDeposit?.id],
    queryFn: async () => {
      if (!selectedDeposit) return []
      
      const { data, error } = await supabase
        .from('security_deposit_deductions')
        .select('*')
        .eq('security_deposit_id', selectedDeposit.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!selectedDeposit,
  })

  const processLeaseEndMutation = useMutation({
    mutationFn: async ({ depositId, damagesAmount, damagesDescription, meterWaterAmount, meterElecAmount, isEditing }: { 
      depositId: string
      damagesAmount: number
      damagesDescription: string
      meterWaterAmount?: number
      meterElecAmount?: number
      isEditing?: boolean
    }) => {
      // Get tenant's outstanding balance and arrears
      const { data: depositData } = await supabase
        .from('security_deposits')
        .select('tenant_id, unit_id')
        .eq('id', depositId)
        .single()

      if (!depositData) throw new Error('Deposit not found')

      // If editing, delete old meter deductions first
      if (isEditing) {
        await supabase
          .from('security_deposit_deductions')
          .delete()
          .eq('security_deposit_id', depositId)
          .eq('deduction_type', 'other')
          .in('description', [
            'Final water meter deduction at lease end',
            'Final electricity meter deduction at lease end'
          ])
      }

      // Calculate total arrears
      const { data: billsData } = await supabase
        .from('bills')
        .select('balance, total_amount')
        .eq('tenant_id', depositData.tenant_id)
        .gt('balance', 0)

      const totalArrears = (billsData || []).reduce((sum, b) => sum + (b.balance || 0), 0)

      // Record damages deduction if any
      if (damagesAmount > 0) {
        const { error: damagesError } = await supabase
          .from('security_deposit_deductions')
          .insert([{
            security_deposit_id: depositId,
            deduction_type: 'damages',
            amount: damagesAmount,
            description: damagesDescription || 'Damages at lease end'
          }])

        if (damagesError) throw damagesError
      }

      // Record meter deductions if provided
      if (meterWaterAmount && meterWaterAmount > 0) {
        const { error: meterWErr } = await supabase
          .from('security_deposit_deductions')
          .insert([{
            security_deposit_id: depositId,
            deduction_type: 'other',
            amount: meterWaterAmount,
            description: 'Final water meter deduction at lease end'
          }])

        if (meterWErr) throw meterWErr
      }

      if (meterElecAmount && meterElecAmount > 0) {
        const { error: meterEErr } = await supabase
          .from('security_deposit_deductions')
          .insert([{
            security_deposit_id: depositId,
            deduction_type: 'other',
            amount: meterElecAmount,
            description: 'Final electricity meter deduction at lease end'
          }])

        if (meterEErr) throw meterEErr
      }

      // Record arrears deduction if any
      if (totalArrears > 0) {
        const { error: arrearsError } = await supabase
          .from('security_deposit_deductions')
          .insert([{
            security_deposit_id: depositId,
            deduction_type: 'arrears',
            amount: totalArrears,
            description: 'Outstanding arrears at lease end'
          }])

        if (arrearsError) throw arrearsError
      }

      // Wait a moment for database triggers to update total_deductions
      // Then fetch the updated deposit to get the correct refund_amount
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Fetch the updated deposit with all calculated fields
      const { data: updatedDeposit, error: fetchError } = await supabase
        .from('security_deposits')
        .select('refund_amount, amount, total_deductions')
        .eq('id', depositId)
        .single()

      if (fetchError) throw fetchError

      // Calculate refund amount: amount - total_deductions
      // Use the calculated refund_amount from the database (generated column)
      // or calculate it manually if needed
      const refundAmount = updatedDeposit?.refund_amount ?? 
        ((updatedDeposit?.amount || 0) - (updatedDeposit?.total_deductions || 0))
      
      const status = refundAmount > 0 ? 'refunded' : 'forfeited'
      
      console.log('Processing refund:', {
        depositId,
        amount: updatedDeposit?.amount,
        totalDeductions: updatedDeposit?.total_deductions,
        refundAmount,
        status
      })

      // Clear all bills (mark as paid) for this tenant since deductions have been made
      // Get all bills to set amount_paid to total_amount
      const { data: billsToUpdate } = await supabase
        .from('bills')
        .select('id, total_amount')
        .eq('tenant_id', depositData.tenant_id)

      if (billsToUpdate && billsToUpdate.length > 0) {
        for (const bill of billsToUpdate) {
          await supabase
            .from('bills')
            .update({ 
              amount_paid: bill.total_amount,
              balance: 0,
              status: 'paid'
            })
            .eq('id', bill.id)
        }
      }

      // Explicitly set updated_at to ensure it's updated for the reports query
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('security_deposits')
        .update({ 
          status,
          notes: `Lease ended. ${damagesDescription || ''}`,
          updated_at: now
        })
        .eq('id', depositId)

      if (updateError) throw updateError
      
      console.log('Deposit updated:', { depositId, status, updated_at: now, refundAmount })

      // If refund was processed (status is 'refunded'), archive tenant and mark unit as vacant
      if (status === 'refunded') {
        // Archive the tenant (set status to 'inactive')
        const { error: tenantUpdateError } = await supabase
          .from('tenants')
          .update({ 
            status: 'inactive',
            updated_at: new Date().toISOString()
          })
          .eq('id', depositData.tenant_id)

        if (tenantUpdateError) throw tenantUpdateError

        // Mark unit as vacant and remove tenant assignment
        const { error: unitUpdateError } = await supabase
          .from('units')
          .update({ 
            status: 'vacant',
            tenant_id: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', depositData.unit_id)

        if (unitUpdateError) throw unitUpdateError
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['security-deposits'] })
      await queryClient.invalidateQueries({ queryKey: ['security-deposit-deductions'] })
      await queryClient.invalidateQueries({ queryKey: ['tenants'] })
      await queryClient.invalidateQueries({ queryKey: ['units'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['refunds-report'] })
      await queryClient.invalidateQueries({ queryKey: ['financial-summary'] })
      
      // Generate receipt data - ensure selectedDeposit exists
      if (selectedDeposit) {
        const totalBalance = leaseEndTenantBills.reduce((sum: number, bill: any) => sum + (bill.balance || 0), 0)
        const depositAmount = selectedDeposit.amount || 0
        const existingDeductions = selectedDeposit.total_deductions || 0
        const newDamagesAmount = parseFloat(damagesAmount) || 0
        const newMeterWater = parseFloat((parseFloat(meterWaterRate || '0') && finalWaterReading) ? ((parseFloat(finalWaterReading) - (leaseEndTenantBills[0]?.water_current_reading || 0)) * parseFloat(meterWaterRate || '0')).toString() : '0') || 0
        const newMeterElec = parseFloat((parseFloat(meterElecRate || '0') && finalElecReading) ? ((parseFloat(finalElecReading) - (leaseEndTenantBills[0]?.elec_current_reading || 0)) * parseFloat(meterElecRate || '0')).toString() : '0') || 0
        const arrearsTodeduct = Math.max(0, totalBalance)
        const totalDeductions = existingDeductions + arrearsTodeduct + newDamagesAmount + newMeterWater + newMeterElec
        const refundAmount = depositAmount - totalDeductions - Math.min(0, totalBalance)
        
        // Format unpaid bills for receipt
        const unpaidBills = leaseEndTenantBills
          .filter((bill: any) => bill.balance > 0)
          .map((bill: any) => ({
            month: bill.billing_month,
            rent: bill.rent_amount || 0,
            water: bill.water_amount || 0,
            electricity: bill.elec_amount || 0,
            balance: bill.balance
          }))
        
        setSettlementReceipt({
          tenantName: selectedDeposit.tenants?.name || 'N/A',
          tenantPhone: selectedDeposit.tenants?.phone || 'N/A',
          unitNumber: selectedDeposit.units?.unit_number || 'N/A',
          buildingName: (selectedDeposit.units as any)?.buildings?.name || 'N/A',
          leaseEndDate: new Date().toISOString().split('T')[0],
          depositAmount,
          existingDeductions,
          arrears: arrearsTodeduct,
          damages: newDamagesAmount,
          // include meter deductions in the receipt object for display
          damagesDescription,
          totalDeductions,
          meterWaterDeduction: newMeterWater,
          meterElecDeduction: newMeterElec,
          refundAmount,
          settlementNotes: `Lease ended. ${damagesDescription || 'No additional notes.'}`,
          unpaidBills
        })
      }
      
      setShowLeaseEndModal(false)
      setShowReceiptModal(true)
      setSelectedDeposit(null)
      setDamagesAmount('')
      setDamagesDescription('')
      setFinalWaterReading('')
      setFinalElecReading('')
      setIsEditingLeaseEnd(false)
      setError(null)
    },
    onError: (error: any) => {
      console.error('Failed to process lease end:', error)
      setError(error.message || 'Failed to process lease end')
    },
  })

  const handleProcessLeaseEnd = (deposit: SecurityDeposit) => {
    setSelectedDeposit(deposit)
    setShowLeaseEndModal(true)
    setIsEditingLeaseEnd(false)
    setError(null)
    setFinalWaterReading('')
    setFinalElecReading('')
    // Reset meter rates to current settings
    const stored = localStorage.getItem('app-settings')
    if (stored) {
      try {
        const settings = JSON.parse(stored)
        setMeterWaterRate(settings.water_rate?.toString() || '50')
        setMeterElecRate(settings.elec_rate?.toString() || '15')
      } catch (e) {
        setMeterWaterRate('50')
        setMeterElecRate('15')
      }
    }
    loadTenantBills(deposit.tenant_id)
  }

  const handleEditProcessedLeaseEnd = (deposit: SecurityDeposit) => {
    setSelectedDeposit(deposit)
    setShowLeaseEndModal(true)
    setIsEditingLeaseEnd(true)
    setError(null)
    setFinalWaterReading('')
    setFinalElecReading('')
    // Reset meter rates to current settings
    const stored = localStorage.getItem('app-settings')
    if (stored) {
      try {
        const settings = JSON.parse(stored)
        setMeterWaterRate(settings.water_rate?.toString() || '50')
        setMeterElecRate(settings.elec_rate?.toString() || '15')
      } catch (e) {
        setMeterWaterRate('50')
        setMeterElecRate('15')
      }
    }
    loadTenantBills(deposit.tenant_id)
  }

  const loadTenantBills = async (tenantId: string) => {
    setLoadingBills(true)
    try {
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('id, billing_month, arrears_brought_forward, water_amount, elec_amount, rent_amount, balance, amount_paid, water_current_reading, elec_current_reading')
        .eq('tenant_id', tenantId)
        .order('billing_month', { ascending: false })

      if (billsError) throw billsError
      setLeaseEndTenantBills(billsData || [])
    } catch (err) {
      console.error('Error loading tenant bills:', err)
      setError('Failed to load tenant billing details')
    } finally {
      setLoadingBills(false)
    }
  }

  const handleSubmitLeaseEnd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDeposit) return
    // find the most recent previous readings (first bill with a numeric reading)
    const prevWater = leaseEndTenantBills.find((b: any) => typeof b.water_current_reading === 'number')?.water_current_reading || 0
    const prevElec = leaseEndTenantBills.find((b: any) => typeof b.elec_current_reading === 'number')?.elec_current_reading || 0
    const waterUsage = Math.max(0, (parseFloat(finalWaterReading || '0') || 0) - (parseFloat(prevWater || '0') || 0))
    const elecUsage = Math.max(0, (parseFloat(finalElecReading || '0') || 0) - (parseFloat(prevElec || '0') || 0))
    const waterRate = parseFloat(meterWaterRate || '0') || 0
    const elecRate = parseFloat(meterElecRate || '0') || 0
    const waterDeduction = Math.max(0, waterUsage * waterRate)
    const elecDeduction = Math.max(0, elecUsage * elecRate)

    processLeaseEndMutation.mutate({
      depositId: selectedDeposit.id,
      damagesAmount: parseFloat(damagesAmount) || 0,
      damagesDescription: damagesDescription,
      meterWaterAmount: waterDeduction,
      meterElecAmount: elecDeduction,
      isEditing: isEditingLeaseEnd
    })
  }

  const generateReceiptHTML = (receipt: SettlementReceipt): string => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lease End Settlement Receipt</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 40px;
            background-color: #f5f5f5;
          }
          .receipt-container {
            max-width: 900px;
            margin: 0 auto;
            background-color: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #1e40af;
            padding-bottom: 20px;
          }
          .header h1 {
            color: #1e40af;
            font-size: 28px;
            margin-bottom: 5px;
          }
          .header p {
            color: #64748b;
            font-size: 14px;
            margin-bottom: 3px;
          }
          .section {
            margin-bottom: 25px;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #1e40af;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e2e8f0;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #f1f5f9;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .label {
            color: #475569;
            font-weight: 500;
            font-size: 13px;
          }
          .value {
            color: #1e293b;
            font-weight: 600;
            font-size: 13px;
            text-align: right;
          }
          .settlement-box {
            background-color: #f0f9ff;
            border: 2px solid #1e40af;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .settlement-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            font-size: 14px;
          }
          .settlement-total {
            display: flex;
            justify-content: space-between;
            padding: 15px 0;
            border-top: 2px solid #1e40af;
            border-bottom: 2px solid #1e40af;
            font-size: 16px;
            font-weight: 700;
            color: #1e40af;
            margin: 15px 0;
          }
          .refund-amount {
            display: flex;
            justify-content: space-between;
            padding: 15px 0;
            font-size: 18px;
            font-weight: 700;
            color: #059669;
            background-color: #f0fdf4;
            padding: 15px;
            border-radius: 6px;
          }
          .deductions-breakdown {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            border-radius: 6px;
            margin: 15px 0;
            font-size: 13px;
          }
          .deduction-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
          }
          .deduction-item .label {
            color: #92400e;
          }
          .deduction-item .value {
            color: #b45309;
          }
          .notes {
            background-color: #f8fafc;
            border-left: 4px solid #64748b;
            padding: 12px;
            border-radius: 4px;
            font-size: 13px;
            color: #475569;
            line-height: 1.5;
            margin-top: 15px;
          }
          .bills-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 12px;
          }
          .bills-table th {
            background-color: #e0e7ff;
            color: #1e40af;
            padding: 10px;
            text-align: left;
            font-weight: 600;
            border-bottom: 2px solid #1e40af;
          }
          .bills-table td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            color: #475569;
          }
          .bills-table tr:last-child td {
            border-bottom: none;
          }
          .bill-month {
            font-weight: 600;
            color: #1e293b;
          }
          .bill-amount {
            text-align: right;
            font-weight: 500;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            color: #94a3b8;
            font-size: 12px;
          }
          @media (max-width: 600px) {
            body {
              padding: 20px;
            }
            .receipt-container {
              padding: 20px;
            }
            .header h1 {
              font-size: 22px;
            }
            .section-title {
              font-size: 12px;
            }
            .info-row, .settlement-row {
              font-size: 12px;
            }
          }
          @media print {
            body {
              background-color: white;
              padding: 0;
            }
            .receipt-container {
              box-shadow: none;
              border-radius: 0;
              max-width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <h1>LEASE END SETTLEMENT RECEIPT</h1>
            <p>Settlement Date: ${formatDate(receipt.leaseEndDate)}</p>
          </div>

          <div class="section">
            <div class="section-title">Tenant Information</div>
            <div class="info-row">
              <span class="label">Tenant Name</span>
              <span class="value">${receipt.tenantName}</span>
            </div>
            <div class="info-row">
              <span class="label">Phone Number</span>
              <span class="value">${receipt.tenantPhone}</span>
            </div>
            <div class="info-row">
              <span class="label">Unit Number</span>
              <span class="value">${receipt.unitNumber}</span>
            </div>
            <div class="info-row">
              <span class="label">Building</span>
              <span class="value">${receipt.buildingName}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Deposit & Settlement Summary</div>
            <div class="settlement-box">
              <div class="settlement-row">
                <span class="label">Security Deposit Amount:</span>
                <span class="value">${formatCurrency(receipt.depositAmount)}</span>
              </div>

              <div class="deductions-breakdown">
                <div class="section-title" style="border: none; padding: 0; margin: 0 0 10px 0;">Deductions Breakdown</div>
                ${receipt.existingDeductions > 0 ? `
                <div class="deduction-item">
                  <span class="label">Previous Deductions:</span>
                  <span class="value">${formatCurrency(receipt.existingDeductions)}</span>
                </div>
                ` : ''}
                ${receipt.arrears > 0 ? `
                <div class="deduction-item">
                  <span class="label">Outstanding Arrears:</span>
                  <span class="value">${formatCurrency(receipt.arrears)}</span>
                </div>
                ` : ''}
                ${receipt.damages > 0 ? `
                <div class="deduction-item">
                  <span class="label">Damages:</span>
                  <span class="value">${formatCurrency(receipt.damages)}</span>
                </div>
                ` : ''}
                ${receipt.meterWaterDeduction && receipt.meterWaterDeduction > 0 ? `
                <div class="deduction-item">
                  <span class="label">Water Meter Deduction:</span>
                  <span class="value">${formatCurrency(receipt.meterWaterDeduction)}</span>
                </div>
                ` : ''}
                ${receipt.meterElecDeduction && receipt.meterElecDeduction > 0 ? `
                <div class="deduction-item">
                  <span class="label">Electricity Meter Deduction:</span>
                  <span class="value">${formatCurrency(receipt.meterElecDeduction)}</span>
                </div>
                ` : ''}
              </div>

              <div class="settlement-total">
                <span>Total Deducted:</span>
                <span style="color: #dc2626;">- ${formatCurrency(receipt.totalDeductions)}</span>
              </div>

              <div class="refund-amount">
                <span>Amount to Refund:</span>
                <span>${formatCurrency(receipt.refundAmount)}</span>
              </div>
            </div>
          </div>

          ${receipt.unpaidBills.length > 0 ? `
          <div class="section">
            <div class="section-title">Unpaid Bills Breakdown</div>
            <table class="bills-table">
              <thead>
                <tr>
                  <th>Billing Month</th>
                  <th style="text-align: right;">Rent</th>
                  <th style="text-align: right;">Water</th>
                  <th style="text-align: right;">Electricity</th>
                  <th style="text-align: right;">Total Balance</th>
                </tr>
              </thead>
              <tbody>
                ${receipt.unpaidBills.map(bill => `
                <tr>
                  <td class="bill-month">${bill.month}</td>
                  <td class="bill-amount">${formatCurrency(bill.rent)}</td>
                  <td class="bill-amount">${formatCurrency(bill.water)}</td>
                  <td class="bill-amount">${formatCurrency(bill.electricity)}</td>
                  <td class="bill-amount" style="font-weight: 700; color: #dc2626;">${formatCurrency(bill.balance)}</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
            <p style="font-size: 12px; color: #64748b; margin-top: 12px;">These amounts have been deducted from the security deposit.</p>
          </div>
          ` : ''}

          ${receipt.damagesDescription ? `
          <div class="section">
            <div class="section-title">Damages Notes</div>
            <div class="notes">${receipt.damagesDescription}</div>
          </div>
          ` : ''}

          <div class="footer">
            <p>This is an official settlement receipt for lease end processing.</p>
            <p style="margin-top: 8px;">Generated on ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </body>
      </html>
    `
  }

  const handlePrintReceipt = () => {
    if (!settlementReceipt) return
    const html = generateReceiptHTML(settlementReceipt)
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  const handleDownloadReceipt = () => {
    if (!settlementReceipt) return
    const html = generateReceiptHTML(settlementReceipt)
    const blob = new Blob([html], { type: 'text/html' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lease-settlement-${settlementReceipt.tenantName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.html`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  const handleViewProcessedReceipt = async (deposit: SecurityDeposit) => {
    // Load the tenant bills to generate the receipt
    try {
      const { data: billsData } = await supabase
        .from('bills')
        .select('id, billing_month, arrears_brought_forward, water_amount, elec_amount, rent_amount, balance, amount_paid')
        .eq('tenant_id', deposit.tenant_id)
        .order('billing_month', { ascending: false })

      const tenantBills = billsData || []
      
      // Generate receipt from the deposit data
      const totalBalance = tenantBills.reduce((sum: number, bill: any) => sum + (bill.balance || 0), 0)
      const depositAmount = deposit.amount || 0
      const totalDeductions = deposit.total_deductions || 0
      
      // Filter unpaid bills
      const unpaidBills = tenantBills
        .filter((bill: any) => bill.balance > 0)
        .map((bill: any) => ({
          month: bill.billing_month,
          rent: bill.rent_amount || 0,
          water: bill.water_amount || 0,
          electricity: bill.elec_amount || 0,
          balance: bill.balance
        }))

      setSettlementReceipt({
        tenantName: deposit.tenants?.name || 'N/A',
        tenantPhone: deposit.tenants?.phone || 'N/A',
        unitNumber: deposit.units?.unit_number || 'N/A',
        buildingName: (deposit.units as any)?.buildings?.name || 'N/A',
        leaseEndDate: new Date().toISOString().split('T')[0],
        depositAmount,
        existingDeductions: totalDeductions,
        arrears: Math.max(0, totalBalance),
        damages: 0, // We can't get this from just the deposit
        totalDeductions,
        refundAmount: deposit.refund_amount || 0,
        damagesDescription: deposit.notes || '',
        settlementNotes: `Lease ended. ${deposit.notes || 'No additional notes.'}`,
        unpaidBills
      })
      
      setShowReceiptModal(true)
    } catch (err) {
      console.error('Error loading receipt:', err)
      setError('Failed to load receipt')
    }
  }

  const visibleDeposits = (deposits || []).filter((d: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (d.tenants?.name || '').toLowerCase().includes(q) ||
      (d.units?.unit_number || '').toString().toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
            Security Deposits
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">Manage tenant security deposits and refunds</p>
        </div>
      </div>

      {depositsError && (
        <div className="card p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50">
          <p className="text-sm text-red-700 dark:text-red-400">
            Error loading security deposits: {depositsError.message}
          </p>
        </div>
      )}

      {depositsLoading && (
        <div className="card text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading security deposits...</p>
        </div>
      )}

      {!depositsLoading && deposits && deposits.length > 0 && (
        <div>
          <div className="p-3 flex items-center justify-end">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deposits..."
              className="input w-64"
            />
          </div>
          <div className="card overflow-x-auto w-full">
            <table className="table w-full text-xs sm:text-sm">
              <thead>
                <tr>
                  <th className="min-w-[120px]">Tenant</th>
                  <th className="min-w-[100px]">Unit</th>
                  <th className="min-w-[100px]">Amount</th>
                  <th className="min-w-[100px]">Deductions</th>
                  <th className="min-w-[100px]">Refund</th>
                  <th className="min-w-[80px]">Status</th>
                  <th className="min-w-[100px]">Date Deposited</th>
                  <th className="min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleDeposits.map((deposit: any) => (
                  <tr key={deposit.id}>
                    <td className="text-slate-700 dark:text-slate-300">
                      <div className="flex flex-col">
                        <span className="font-semibold">{deposit.tenants?.name || 'N/A'}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {deposit.tenants?.phone || ''}
                        </span>
                      </div>
                    </td>
                    <td className="text-slate-600 dark:text-slate-400">
                      {deposit.units?.unit_number} ({deposit.units?.buildings?.name})
                    </td>
                    <td className="font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(deposit.amount)}
                    </td>
                    <td className="font-medium text-red-600 dark:text-red-400">
                      {formatCurrency(deposit.total_deductions || 0)}
                    </td>
                    <td className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(deposit.refund_amount || 0)}
                    </td>
                    <td>
                      <span
                        className={`badge text-[10px] px-1.5 py-0.5 ${
                          deposit.status === 'active'
                            ? 'badge-success'
                            : deposit.status === 'refunded'
                            ? 'badge-info'
                            : deposit.status === 'processing'
                            ? 'badge-warning'
                            : 'badge-danger'
                        }`}
                      >
                        {deposit.status}
                      </span>
                    </td>
                    <td className="text-slate-600 dark:text-slate-400">
                      {formatDate(deposit.date_deposited)}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {deposit.status === 'active' && (
                          <button
                            onClick={() => handleProcessLeaseEnd(deposit)}
                            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                            title="Process Lease End"
                          >
                            <FileText size={14} />
                          </button>
                        )}
                        {(deposit.status === 'refunded' || deposit.status === 'forfeited') && (
                          <>
                            <button
                              onClick={() => handleEditProcessedLeaseEnd(deposit)}
                              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-all"
                              title="Edit Lease End Settlement"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleViewProcessedReceipt(deposit)}
                              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-all"
                              title="View Settlement Receipt"
                            >
                              <Download size={14} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setSelectedDeposit(deposit)}
                          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-all"
                          title="View Details"
                        >
                          <Shield size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!depositsLoading && (!deposits || deposits.length === 0) && (
        <div className="card text-center py-16">
          <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="text-slate-400" size={40} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">No security deposits yet</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Security deposits will appear here when tenants are created</p>
        </div>
      )}

      {/* Lease End Modal */}
      {showLeaseEndModal && selectedDeposit && (
        <div className="modal-overlay" onClick={() => {
          setShowLeaseEndModal(false)
          setSelectedDeposit(null)
          setError(null)
          setLeaseEndTenantBills([])
          setDamagesAmount('')
          setDamagesDescription('')
          setFinalWaterReading('')
          setFinalElecReading('')
          setIsEditingLeaseEnd(false)
        }}>
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                    {isEditingLeaseEnd ? 'Edit' : 'Process'} Lease End
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-zinc-400">
                    Final settlement for {selectedDeposit.tenants?.name || 'tenant'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowLeaseEndModal(false)
                    setSelectedDeposit(null)
                    setError(null)
                    setFinalWaterReading('')
                    setFinalElecReading('')
                    setIsEditingLeaseEnd(false)
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-300 mb-1">Error</p>
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                  >
                    <X size={18} />
                  </button>
                </div>
              )}

              {/* Current Deposit Status */}
              <div className="mb-6 p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Deposit Status</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600 dark:text-zinc-400">Deposit Amount:</span>
                    <span className="font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(selectedDeposit.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-600 dark:text-zinc-400">Current Deductions:</span>
                    <span className="font-medium text-red-600 dark:text-red-400">{formatCurrency(selectedDeposit.total_deductions || 0)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 dark:border-zinc-700 pt-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Available Refund:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedDeposit.refund_amount || 0)}</span>
                  </div>
                </div>
              </div>

              {/* Arrears & Bills Breakdown */}
              <div className="mb-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Outstanding Arrears & Balances</h3>
                {loadingBills ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader className="animate-spin text-primary-600 mr-2" size={20} />
                    <span className="text-slate-600 dark:text-slate-400">Loading billing details...</span>
                  </div>
                ) : leaseEndTenantBills.length > 0 ? (
                  <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-xl p-4">
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {leaseEndTenantBills.map((bill: any) => (
                        <div key={bill.id} className="bg-white dark:bg-zinc-800 p-3 rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100">{bill.billing_month}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Rent: {formatCurrency(bill.rent_amount)} | Water: {formatCurrency(bill.water_amount)} | Electricity: {formatCurrency(bill.elec_amount)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">Balance: {formatCurrency(bill.balance)}</p>
                              {bill.arrears_brought_forward > 0 && (
                                <p className="text-xs text-orange-600 dark:text-orange-400">Arrears: {formatCurrency(bill.arrears_brought_forward)}</p>
                              )}
                            </div>

                              
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800/50">
                      {(() => {
                        const totalBalance = leaseEndTenantBills.reduce((sum: number, bill: any) => sum + (bill.balance || 0), 0)
                        const totalArrears = leaseEndTenantBills.reduce((sum: number, bill: any) => sum + (bill.arrears_brought_forward || 0), 0)
                        return (
                          <>
                            <div className="flex justify-between mb-2">
                              <span className="font-semibold text-orange-900 dark:text-orange-300">Total Outstanding Balance:</span>
                              <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(totalBalance)}</span>
                            </div>
                            {totalArrears > 0 && (
                              <div className="flex justify-between">
                                <span className="font-semibold text-orange-900 dark:text-orange-300">Total Arrears Brought Forward:</span>
                                <span className="font-bold text-orange-600 dark:text-orange-400">{formatCurrency(totalArrears)}</span>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-xl p-4">
                    <p className="text-sm text-green-700 dark:text-green-300">✓ No outstanding arrears or balances</p>
                  </div>
                )}
              </div>

              {/* Final Meter Readings (placed below bills list, above settlement calculation) */}
              <div className="mb-6 p-4 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700">
                <h3 className="font-semibold text-slate-900 dark:text-zinc-100 mb-3">Final Meter Readings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">Final Water Reading</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={finalWaterReading}
                        onChange={(e) => setFinalWaterReading(e.target.value)}
                        className="input flex-1"
                        placeholder={String(leaseEndTenantBills.find((b: any) => typeof b.water_current_reading === 'number')?.water_current_reading || 0)}
                      />
                      <input
                        type="number"
                        value={meterWaterRate}
                        onChange={(e) => setMeterWaterRate(e.target.value)}
                        className="input w-28"
                        placeholder="Rate"
                      />
                    </div>
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      <div>Previous: <span className="font-medium">{leaseEndTenantBills.find((b: any) => typeof b.water_current_reading === 'number')?.water_current_reading || 0}</span></div>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">Final Electricity Reading</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={finalElecReading}
                        onChange={(e) => setFinalElecReading(e.target.value)}
                        className="input flex-1"
                        placeholder={String(leaseEndTenantBills.find((b: any) => typeof b.elec_current_reading === 'number')?.elec_current_reading || 0)}
                      />
                      <input
                        type="number"
                        value={meterElecRate}
                        onChange={(e) => setMeterElecRate(e.target.value)}
                        className="input w-28"
                        placeholder="Rate"
                      />
                    </div>
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                      <div>Previous: <span className="font-medium">{leaseEndTenantBills.find((b: any) => typeof b.elec_current_reading === 'number')?.elec_current_reading || 0}</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Settlement Calculation */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-xl">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Settlement Calculation</h3>
                {(() => {
                  const totalBalance = leaseEndTenantBills.reduce((sum: number, bill: any) => sum + (bill.balance || 0), 0)
                  const depositAmount = selectedDeposit.amount || 0
                  const existingDeductions = selectedDeposit.total_deductions || 0
                  const newDamagesAmount = parseFloat(damagesAmount) || 0
                  // previous readings
                  const prevWater = leaseEndTenantBills.find((b: any) => typeof b.water_current_reading === 'number')?.water_current_reading || 0
                  const prevElec = leaseEndTenantBills.find((b: any) => typeof b.elec_current_reading === 'number')?.elec_current_reading || 0
                  const waterUsage = Math.max(0, (parseFloat(finalWaterReading || '0') || 0) - (parseFloat(prevWater || '0') || 0))
                  const elecUsage = Math.max(0, (parseFloat(finalElecReading || '0') || 0) - (parseFloat(prevElec || '0') || 0))
                  const waterRateNum = parseFloat(meterWaterRate || '0') || 0
                  const elecRateNum = parseFloat(meterElecRate || '0') || 0
                  const meterWaterDeduction = Math.max(0, waterUsage * waterRateNum)
                  const meterElecDeduction = Math.max(0, elecUsage * elecRateNum)
                  // Deduct only positive balance (arrears), not negative (overpayment adds to refund)
                  const arrearsTodeduct = Math.max(0, totalBalance)
                  const totalDeductions = existingDeductions + arrearsTodeduct + newDamagesAmount + meterWaterDeduction + meterElecDeduction
                  // If overpaid (negative), add to refund; if arrears (positive), subtract from refund
                  const refundAmount = depositAmount - totalDeductions - Math.min(0, totalBalance)

                  return (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Deposit Amount:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(depositAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Existing Deductions:</span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(existingDeductions)}</span>
                      </div>
                      {totalBalance !== 0 && (
                        <div className={`p-2 rounded ${totalBalance < 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : ''}`}>
                          <div className="flex justify-between">
                            <span className={`text-slate-600 dark:text-slate-400 ${totalBalance < 0 ? 'text-green-700 dark:text-green-300 font-semibold' : ''}`}>
                              {totalBalance < 0 ? 'Tenant Overpayment (Credit):' : 'Tenant Arrears/Balance:'}
                            </span>
                            <span className={`font-semibold ${totalBalance < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {formatCurrency(totalBalance)}
                            </span>
                          </div>
                          {totalBalance < 0 && (
                            <p className="text-xs text-green-700 dark:text-green-400 mt-1">Tenant paid more than due - added to deposit</p>
                          )}
                        </div>
                      )}
                      {arrearsTodeduct > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600 dark:text-slate-400">Arrears to Deduct:</span>
                          <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(arrearsTodeduct)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Damages (to be added):</span>
                        <span className="font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(newDamagesAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Water Usage:</span>
                        <span className="font-semibold">{waterUsage} units</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Water Deduction:</span>
                        <span className="font-semibold text-red-600">{formatCurrency(meterWaterDeduction)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Electricity Usage:</span>
                        <span className="font-semibold">{elecUsage} units</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600 dark:text-slate-400">Electricity Deduction:</span>
                        <span className="font-semibold text-red-600">{formatCurrency(meterElecDeduction)}</span>
                      </div>
                      <div className="border-t border-blue-200 dark:border-blue-800/50 pt-2 my-2"></div>
                      <div className="flex justify-between bg-white dark:bg-blue-900/40 p-2 rounded">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">Total Amount Deducted:</span>
                        <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(totalDeductions)}</span>
                      </div>
                      <div className="flex justify-between bg-white dark:bg-blue-900/40 p-2 rounded">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">Amount to Refund:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(refundAmount)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              <form onSubmit={handleSubmitLeaseEnd} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Additional Damages Amount (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={damagesAmount}
                    onChange={(e) => setDamagesAmount(e.target.value)}
                    className="input"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Enter any damages or additional deductions beyond arrears
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-2">
                    Damages Description
                  </label>
                  <textarea
                    value={damagesDescription}
                    onChange={(e) => setDamagesDescription(e.target.value)}
                    className="input"
                    rows={3}
                    placeholder="Describe any damages or additional charges..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowLeaseEndModal(false)
                      setSelectedDeposit(null)
                      setError(null)
                      setLeaseEndTenantBills([])
                      setDamagesAmount('')
                      setDamagesDescription('')
                      setFinalWaterReading('')
                      setFinalElecReading('')
                      setIsEditingLeaseEnd(false)
                    }}
                    className="flex-1 btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn btn-primary"
                    disabled={processLeaseEndMutation.isPending}
                  >
                    {processLeaseEndMutation.isPending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      'Process Lease End'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Deductions Detail Modal */}
      {selectedDeposit && !showLeaseEndModal && (
        <div className="modal-overlay" onClick={() => setSelectedDeposit(null)}>
          <div className="modal-content max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                Security Deposit Details
              </h2>
              <p className="text-sm text-slate-600 dark:text-zinc-400 mb-6">
                {selectedDeposit.tenants?.name || 'Tenant'} - {selectedDeposit.units?.unit_number}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl">
                  <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Deposit Amount</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-zinc-100">{formatCurrency(selectedDeposit.amount)}</p>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-zinc-900 rounded-xl">
                  <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">Refund Amount</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedDeposit.refund_amount || 0)}</p>
                </div>
              </div>

              {deductions && deductions.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-700 dark:text-zinc-300 mb-3">Deductions</h3>
                  <div className="space-y-2">
                    {deductions.map((deduction: any) => (
                      <div key={deduction.id} className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-zinc-100 capitalize">{deduction.deduction_type}</p>
                          {deduction.description && (
                            <p className="text-xs text-slate-600 dark:text-zinc-400">{deduction.description}</p>
                          )}
                          <p className="text-xs text-slate-500 dark:text-zinc-500">{formatDate(deduction.created_at)}</p>
                        </div>
                        <p className="font-bold text-red-600 dark:text-red-400">{formatCurrency(deduction.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800 mt-6">
                <button
                  onClick={() => setSelectedDeposit(null)}
                  className="flex-1 btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Receipt Modal */}
      {showReceiptModal && settlementReceipt && (
        <div className="modal-overlay" onClick={() => {
          setShowReceiptModal(false)
          setSettlementReceipt(null)
        }}>
          <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-zinc-50 mb-2">
                    Settlement Receipt
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-zinc-400">
                    Lease end settlement for {settlementReceipt.tenantName}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowReceiptModal(false)
                    setSettlementReceipt(null)
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Receipt Preview */}
              <div className="mb-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl p-8 max-h-[50vh] overflow-y-auto">
                <div className="max-w-2xl mx-auto space-y-6">
                  {/* Header */}
                  <div className="text-center border-b-2 border-slate-300 dark:border-zinc-700 pb-6">
                    <h1 className="text-3xl font-bold text-primary-600 dark:text-primary-400 mb-2">
                      LEASE END SETTLEMENT RECEIPT
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Settlement Date: {formatDate(settlementReceipt.leaseEndDate)}
                    </p>
                  </div>

                  {/* Tenant Info */}
                  <div>
                    <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-primary-600 dark:text-primary-400">
                      Tenant Information
                    </h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Tenant Name:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{settlementReceipt.tenantName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Phone:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{settlementReceipt.tenantPhone}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Unit:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{settlementReceipt.unitNumber}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Building:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{settlementReceipt.buildingName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Settlement Summary */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-4">
                    <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-primary-600 dark:text-primary-400">
                      Settlement Summary
                    </h3>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">Security Deposit:</span>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(settlementReceipt.depositAmount)}</span>
                      </div>
                    </div>

                    {/* Deductions */}
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded p-3 mb-4">
                      <p className="text-xs font-semibold text-orange-900 dark:text-orange-300 mb-2 uppercase">Deductions</p>
                      <div className="space-y-1">
                        {settlementReceipt.existingDeductions > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-orange-700 dark:text-orange-400">Previous Deductions:</span>
                            <span className="font-semibold text-orange-700 dark:text-orange-400">{formatCurrency(settlementReceipt.existingDeductions)}</span>
                          </div>
                        )}
                        {settlementReceipt.arrears > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-orange-700 dark:text-orange-400">Outstanding Arrears:</span>
                            <span className="font-semibold text-orange-700 dark:text-orange-400">{formatCurrency(settlementReceipt.arrears)}</span>
                          </div>
                        )}
                        {settlementReceipt.damages > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-orange-700 dark:text-orange-400">Damages:</span>
                            <span className="font-semibold text-orange-700 dark:text-orange-400">{formatCurrency(settlementReceipt.damages)}</span>
                          </div>
                        )}
                        {settlementReceipt.meterWaterDeduction && settlementReceipt.meterWaterDeduction > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-orange-700 dark:text-orange-400">Water Meter Deduction:</span>
                            <span className="font-semibold text-orange-700 dark:text-orange-400">{formatCurrency(settlementReceipt.meterWaterDeduction)}</span>
                          </div>
                        )}
                        {settlementReceipt.meterElecDeduction && settlementReceipt.meterElecDeduction > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-orange-700 dark:text-orange-400">Electricity Meter Deduction:</span>
                            <span className="font-semibold text-orange-700 dark:text-orange-400">{formatCurrency(settlementReceipt.meterElecDeduction)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between text-sm font-bold border-t-2 border-blue-200 dark:border-blue-800/50 pt-3 mb-3">
                      <span className="text-slate-900 dark:text-slate-100">Total Deducted:</span>
                      <span className="text-red-600 dark:text-red-400">- {formatCurrency(settlementReceipt.totalDeductions)}</span>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded p-3">
                      <div className="flex justify-between">
                        <span className="font-bold text-green-900 dark:text-green-300">Amount to Refund:</span>
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(settlementReceipt.refundAmount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Damages Notes */}
                  {settlementReceipt.damagesDescription && (
                    <div>
                      <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-primary-600 dark:text-primary-400">
                        Damages Notes
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 bg-gray-50 dark:bg-gray-900/40 p-3 rounded">
                        {settlementReceipt.damagesDescription}
                      </p>
                    </div>
                  )}

                  {/* Unpaid Bills Breakdown */}
                  {settlementReceipt.unpaidBills.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-primary-600 dark:text-primary-400">
                        Unpaid Bills Breakdown
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-primary-100 dark:bg-primary-900/30">
                              <th className="text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-primary-200 dark:border-primary-800">Billing Month</th>
                              <th className="text-right px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-primary-200 dark:border-primary-800">Rent</th>
                              <th className="text-right px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-primary-200 dark:border-primary-800">Water</th>
                              <th className="text-right px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-primary-200 dark:border-primary-800">Electricity</th>
                              <th className="text-right px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 border-b border-primary-200 dark:border-primary-800">Total Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {settlementReceipt.unpaidBills.map((bill, idx) => (
                              <tr key={idx} className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{bill.month}</td>
                                <td className="text-right px-3 py-2 text-slate-600 dark:text-slate-400">{formatCurrency(bill.rent)}</td>
                                <td className="text-right px-3 py-2 text-slate-600 dark:text-slate-400">{formatCurrency(bill.water)}</td>
                                <td className="text-right px-3 py-2 text-slate-600 dark:text-slate-400">{formatCurrency(bill.electricity)}</td>
                                <td className="text-right px-3 py-2 font-bold text-red-600 dark:text-red-400">{formatCurrency(bill.balance)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">These amounts have been deducted from the security deposit.</p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="text-center text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <p>This is an official settlement receipt for lease end processing.</p>
                    <p className="mt-2">Generated on {new Date().toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
                <button
                  onClick={() => {
                    setShowReceiptModal(false)
                    setSettlementReceipt(null)
                  }}
                  className="flex-1 btn btn-secondary"
                >
                  Close
                </button>
                <button
                  onClick={handlePrintReceipt}
                  className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                >
                  <Printer size={18} />
                  Print Receipt
                </button>
                <button
                  onClick={handleDownloadReceipt}
                  className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                  title="Download as HTML file"
                >
                  <Download size={18} />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

