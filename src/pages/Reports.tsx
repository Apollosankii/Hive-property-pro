import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { exportToExcel } from '@/lib/excel'
import { exportElementToPDF } from '@/lib/pdf'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { OccupancyChart } from '@/components/charts/OccupancyChart'
import { ExpenseBreakdownChart } from '@/components/charts/ExpenseBreakdownChart'
import { ArrearsAgingChart } from '@/components/charts/ArrearsAgingChart'
import { FinancialOverviewChart } from '@/components/charts/FinancialOverviewChart'

export default function Reports() {
  // Set default date range to last 10 years to show all refunds by default
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear() - 10, 0, 1)
      .toISOString()
      .split('T')[0]
  )
  const [endDate, setEndDate] = useState(
    new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Tomorrow to include today
  )
  const [reportType, setReportType] = useState<'revenue' | 'arrears' | 'occupancy' | 'salaries' | 'expenses' | 'inventory' | 'financial' | 'refunds'>('revenue')

  const { data: revenueData, error: revenueError } = useQuery({
    queryKey: ['revenue-report', startDate, endDate],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch payments first
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .gte('payment_date', startDate)
        .lte('payment_date', endDate)
        .order('payment_date', { ascending: false })
      
      if (paymentsError) {
        console.error('Revenue report query error:', paymentsError)
        throw paymentsError
      }
      
      if (!paymentsData || paymentsData.length === 0) {
        console.log('No payments found for revenue report')
        return { payments: [], total: 0 }
      }
      
      // Fetch related data separately
      const paymentsWithRelations = await Promise.all(
        paymentsData.map(async (payment: any) => {
          const [billRes, unitRes, tenantRes] = await Promise.all([
            payment.bill_id
              ? supabase
                  .from('bills')
                  .select('billing_month')
                  .eq('id', payment.bill_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            payment.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', payment.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            payment.tenant_id
              ? supabase
                  .from('tenants')
                  .select('name')
                  .eq('id', payment.tenant_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          // Get building name
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
            ...payment,
            bills: billRes.data ? { billing_month: billRes.data.billing_month } : null,
            units: unitRes.data ? {
              unit_number: unitRes.data.unit_number,
              buildings: buildingName ? { name: buildingName } : null
            } : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null
          }
        })
      )
      
      const total = paymentsWithRelations.reduce((sum, p) => sum + (p.amount || 0), 0)
      console.log('Revenue report:', { payments: paymentsWithRelations.length, total })
      return { payments: paymentsWithRelations, total }
    },
    enabled: reportType === 'revenue',
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: arrearsData, error: arrearsError } = useQuery({
    queryKey: ['arrears-report'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch bills with balance > 0 (unpaid amounts)
      // Balance is calculated as: total_amount - amount_paid
      // So if 9000 is paid on a 10000 bill, balance = 1000 (which becomes arrears)
      const { data: billsData, error: billsError } = await supabase
        .from('bills')
        .select('*')
        .gt('balance', 0)
        .order('balance', { ascending: false })
      
      if (billsError) {
        console.error('Arrears report query error:', billsError)
        throw billsError
      }
      
      if (!billsData || billsData.length === 0) {
        console.log('No bills with outstanding balance found')
        return { bills: [], total: 0, aging: { current: [], '30days': [], '60days': [], '90days': [] } }
      }
      
      console.log(`Found ${billsData.length} bills with outstanding balance`)
      
      // Fetch related data separately for each bill
      const billsWithRelations = await Promise.all(
        billsData.map(async (bill: any) => {
          const [unitRes, tenantRes] = await Promise.all([
            bill.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', bill.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            bill.tenant_id
              ? supabase
                  .from('tenants')
                  .select('name, phone')
                  .eq('id', bill.tenant_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          // Get building name
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
            ...bill,
            units: unitRes.data ? {
              unit_number: unitRes.data.unit_number,
              buildings: buildingName ? { name: buildingName } : null
            } : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name, phone: tenantRes.data.phone } : null
          }
        })
      )
      
      const total = billsWithRelations.reduce((sum, b) => sum + (b.balance || 0), 0)
      
      // Categorize by age
      const now = new Date()
      const aging = {
        current: [] as any[],
        '30days': [] as any[],
        '60days': [] as any[],
        '90days': [] as any[],
      }

      billsWithRelations.forEach((bill) => {
        // Use billing_month to calculate days past, not created_at
        const billMonth = new Date(bill.billing_month)
        // Calculate days from the end of the billing month
        const monthEnd = new Date(billMonth.getFullYear(), billMonth.getMonth() + 1, 0)
        const daysPast = Math.floor((now.getTime() - monthEnd.getTime()) / (1000 * 60 * 60 * 24))
        
        console.log(`Bill ${bill.id}: billing_month=${bill.billing_month}, monthEnd=${monthEnd.toISOString()}, daysPast=${daysPast}, balance=${bill.balance}`)
        
        if (daysPast <= 0) {
          aging.current.push(bill)
        } else if (daysPast <= 30) {
          aging['30days'].push(bill)
        } else if (daysPast <= 60) {
          aging['60days'].push(bill)
        } else {
          aging['90days'].push(bill)
        }
      })

      console.log('Arrears aging breakdown:', {
        current: aging.current.length,
        '30days': aging['30days'].length,
        '60days': aging['60days'].length,
        '90days': aging['90days'].length,
        total
      })

      return { bills: billsWithRelations, total, aging }
    },
    enabled: reportType === 'arrears',
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: occupancyData, error: occupancyError } = useQuery({
    queryKey: ['occupancy-report'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // Fetch units first
      const { data: unitsData, error: unitsError } = await supabase
        .from('units')
        .select('*')
        .order('unit_number')
      
      if (unitsError) {
        console.error('Occupancy report query error:', unitsError)
        throw unitsError
      }
      
      if (!unitsData || unitsData.length === 0) {
        console.log('No units found for occupancy report')
        return { units: [], occupied: 0, vacant: 0, total: 0, occupancyRate: '0' }
      }
      
      // Fetch buildings and tenants separately
      const unitsWithRelations = await Promise.all(
        unitsData.map(async (unit: any) => {
          const [buildingRes, tenantRes] = await Promise.all([
            unit.building_id
              ? supabase
                  .from('buildings')
                  .select('name')
                  .eq('id', unit.building_id)
                  .single()
              : Promise.resolve({ data: null, error: null }),
            unit.tenant_id
              ? supabase
                  .from('tenants')
                  .select('name')
                  .eq('id', unit.tenant_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          return {
            ...unit,
            buildings: buildingRes.data ? { name: buildingRes.data.name } : null,
            tenants: tenantRes.data ? { name: tenantRes.data.name } : null
          }
        })
      )
      
      const occupied = unitsWithRelations.filter((u) => u.status === 'occupied').length
      const vacant = unitsWithRelations.filter((u) => u.status === 'vacant').length
      const total = unitsWithRelations.length
      const occupancyRate = total > 0 ? ((occupied / total) * 100).toFixed(1) : '0'

      console.log('Occupancy report:', { occupied, vacant, total, occupancyRate })
      return { units: unitsWithRelations, occupied, vacant, total, occupancyRate }
    },
    enabled: reportType === 'occupancy',
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  // Salaries Report Query
  const { data: salariesData } = useQuery({
    queryKey: ['salaries-report', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salaries')
        .select('*, employees(name, position)')
        .gte('salary_month', startDate)
        .lte('salary_month', endDate)
        .order('salary_month', { ascending: false })
      
      if (error) throw error
      const total = data?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0
      return { salaries: data || [], total }
    },
    enabled: reportType === 'salaries',
    staleTime: 0,
  })

  // Expenses Report Query
  const { data: expensesData } = useQuery({
    queryKey: ['expenses-report', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: false })
      
      if (error) throw error
      const total = data?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0
      return { expenses: data || [], total }
    },
    enabled: reportType === 'expenses',
    staleTime: 0,
  })

  // Inventory Report Query
  const { data: inventoryData } = useQuery({
    queryKey: ['inventory-report'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('item_name')
      
      if (error) throw error
      const totalValue = data?.reduce((sum, i) => sum + (i.total_value || 0), 0) || 0
      const lowStock = data?.filter(i => i.status === 'low_stock' || i.status === 'out_of_stock') || []
      return { items: data || [], totalValue, lowStockCount: lowStock.length }
    },
    enabled: reportType === 'inventory',
    staleTime: 0,
  })

  // Security Deposits Held Query (Total active deposits)
  const { data: depositsHeldData } = useQuery({
    queryKey: ['security-deposits-held'],
    queryFn: async () => {
      const { data: depositsData, error } = await supabase
        .from('security_deposits')
        .select('amount, total_deductions, refund_amount')
        .eq('status', 'active')
      
      if (error) {
        console.error('Security deposits held query error:', error)
        throw error
      }

      const totalHeld = depositsData?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0
      const totalDeductions = depositsData?.reduce((sum, d) => sum + (d.total_deductions || 0), 0) || 0
      const netHeld = totalHeld - totalDeductions

      return { 
        totalHeld, 
        totalDeductions, 
        netHeld,
        count: depositsData?.length || 0
      }
    },
    staleTime: 0,
    refetchOnMount: true,
  })

  // Financial Summary Query
  const { data: financialData } = useQuery({
    queryKey: ['financial-summary', startDate, endDate],
    queryFn: async () => {
      // Convert date strings to ISO format with time for proper timestamp comparison
      const startDateTime = new Date(startDate).toISOString()
      const endDateTime = new Date(endDate + 'T23:59:59.999Z').toISOString()
      
      const [revenueRes, expensesRes, salariesRes, refundsRes] = await Promise.all([
        supabase.from('payments').select('amount').gte('payment_date', startDate).lte('payment_date', endDate),
        supabase.from('expenses').select('amount').gte('expense_date', startDate).lte('expense_date', endDate),
        supabase.from('salaries').select('total_amount').gte('salary_month', startDate).lte('salary_month', endDate),
        supabase.from('security_deposits').select('refund_amount').eq('status', 'refunded').gte('updated_at', startDateTime).lte('updated_at', endDateTime),
      ])

      const revenue = revenueRes.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0
      const expenses = expensesRes.data?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0
      const salaries = salariesRes.data?.reduce((sum, s) => sum + (s.total_amount || 0), 0) || 0
      const refunds = refundsRes.data?.reduce((sum, r) => sum + (r.refund_amount || 0), 0) || 0
      const netProfit = revenue - expenses - salaries - refunds

      return { revenue, expenses, salaries, refunds, netProfit }
    },
    enabled: reportType === 'financial',
    staleTime: 0,
  })

  // Security Deposit Refunds Query
  const { data: refundsData } = useQuery({
    queryKey: ['refunds-report', startDate, endDate],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('No session found, queries may fail due to RLS')
      }

      // First, fetch ALL refunded deposits to see what we have (for debugging and comparison)
      const { data: allRefundedDeposits } = await supabase
        .from('security_deposits')
        .select('id, status, updated_at, refund_amount')
        .eq('status', 'refunded')
        .order('updated_at', { ascending: false })
      
      console.log('All refunded deposits (before date filter):', {
        count: allRefundedDeposits?.length || 0,
        deposits: allRefundedDeposits?.map((d: any) => ({
          id: d.id,
          status: d.status,
          updated_at: d.updated_at,
          refund_amount: d.refund_amount
        }))
      })
      
      // Convert date strings to ISO format with time for proper comparison
      const startDateTime = new Date(startDate).toISOString()
      const endDateTime = new Date(endDate + 'T23:59:59.999Z').toISOString()
      
      console.log('Date filter:', { startDate, endDate, startDateTime, endDateTime })
      
      // Fetch refunded security deposits within date range
      const { data: depositsData, error: depositsError } = await supabase
        .from('security_deposits')
        .select('*')
        .eq('status', 'refunded')
        .gte('updated_at', startDateTime)
        .lte('updated_at', endDateTime)
        .order('updated_at', { ascending: false })
      
      if (depositsError) {
        console.error('Refunds report query error:', depositsError)
        throw depositsError
      }
      
      if (!depositsData || depositsData.length === 0) {
        console.log('No refunded deposits found in date range', {
          allRefundedCount: allRefundedDeposits?.length || 0,
          filteredCount: 0,
          dateRange: { startDateTime, endDateTime }
        })
        
        // If we have refunds but they're outside the date range, show a warning
        if (allRefundedDeposits && allRefundedDeposits.length > 0) {
          console.warn('Refunds exist but are outside the selected date range. Consider expanding the date range.')
          console.warn('Refund dates:', allRefundedDeposits.map((d: any) => ({
            id: d.id,
            updated_at: d.updated_at,
            isInRange: d.updated_at >= startDateTime && d.updated_at <= endDateTime
          })))
        }
        
        return { refunds: [], total: 0, allRefundedCount: allRefundedDeposits?.length || 0 }
      }
      
      console.log('Filtered refunded deposits:', {
        count: depositsData.length,
        deposits: depositsData.map(d => ({
          id: d.id,
          updated_at: d.updated_at,
          refund_amount: d.refund_amount
        }))
      })
      
      // Fetch related tenant and unit data
      const refundsWithRelations = await Promise.all(
        depositsData.map(async (deposit: any) => {
          const [tenantRes, unitRes] = await Promise.all([
            deposit.tenant_id
              ? supabase
                  .from('tenants')
                  .select('name, phone')
                  .eq('id', deposit.tenant_id)
                  .single()
                  .then(res => {
                    // If tenant not found (might be archived), return null gracefully
                    if (res.error && res.error.code === 'PGRST116') {
                      return { data: null, error: null }
                    }
                    return res
                  })
              : Promise.resolve({ data: null, error: null }),
            deposit.unit_id
              ? supabase
                  .from('units')
                  .select('unit_number, building_id')
                  .eq('id', deposit.unit_id)
                  .single()
              : Promise.resolve({ data: null, error: null })
          ])
          
          // Get building name
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
            tenants: tenantRes.data ? { name: tenantRes.data.name, phone: tenantRes.data.phone } : null,
            units: unitRes.data ? {
              unit_number: unitRes.data.unit_number,
              buildings: buildingName ? { name: buildingName } : null
            } : null
          }
        })
      )
      
      const total = refundsWithRelations.reduce((sum, r) => sum + (r.refund_amount || 0), 0)
      
      console.log('Refunds report:', { 
        refunds: refundsWithRelations.length, 
        total, 
        startDateTime, 
        endDateTime,
        depositsFound: depositsData.length,
        allRefundedCount: allRefundedDeposits?.length || 0,
        sampleDeposit: depositsData[0] ? {
          id: depositsData[0].id,
          status: depositsData[0].status,
          refund_amount: depositsData[0].refund_amount,
          updated_at: depositsData[0].updated_at
        } : null
      })
      
      return { 
        refunds: refundsWithRelations, 
        total,
        allRefundedCount: allRefundedDeposits?.length || 0
      }
    },
    enabled: reportType === 'refunds',
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

  const handleExportExcel = () => {
    if (reportType === 'revenue' && revenueData) {
      exportToExcel(
        revenueData.payments.map((p: any) => ({
          Date: formatDate(p.payment_date),
          Tenant: p.tenants?.name || 'N/A',
          Unit: p.units?.unit_number || 'N/A',
          Amount: p.amount,
          Method: p.payment_method,
        })),
        'revenue-report'
      )
    } else if (reportType === 'arrears' && arrearsData) {
      exportToExcel(
        arrearsData.bills.map((b: any) => ({
          'Billing Month': b.billing_month,
          Tenant: b.tenants?.name || 'N/A',
          Unit: b.units?.unit_number || 'N/A',
          'Total Amount': b.total_amount,
          'Amount Paid': b.amount_paid,
          Balance: b.balance,
        })),
        'arrears-report'
      )
    } else if (reportType === 'occupancy' && occupancyData) {
      exportToExcel(
        occupancyData.units.map((u: any) => ({
          'Unit Number': u.unit_number,
          Building: u.buildings?.name || 'N/A',
          Status: u.status,
          Tenant: u.tenants?.name || 'Vacant',
          'Monthly Rent': u.monthly_rent,
        })),
        'occupancy-report'
      )
    } else if (reportType === 'salaries' && salariesData) {
      exportToExcel(
        salariesData.salaries.map((s: any) => ({
          Month: s.salary_month,
          Employee: s.employees?.name || 'N/A',
          Position: s.employees?.position || 'N/A',
          'Base Salary': s.base_salary,
          Bonuses: s.bonuses,
          Deductions: s.deductions,
          'Total Amount': s.total_amount,
          'Amount Paid': s.amount_paid,
          Balance: s.balance,
          Status: s.status,
        })),
        'salaries-report'
      )
    } else if (reportType === 'expenses' && expensesData) {
      exportToExcel(
        expensesData.expenses.map((e: any) => ({
          Date: e.expense_date,
          Description: e.description,
          Category: e.category,
          Amount: e.amount,
          Vendor: e.vendor || 'N/A',
        })),
        'expenses-report'
      )
    } else if (reportType === 'inventory' && inventoryData) {
      exportToExcel(
        inventoryData.items.map((i: any) => ({
          'Item Name': i.item_name,
          Category: i.category || 'N/A',
          Quantity: i.quantity,
          Unit: i.unit,
          'Unit Cost': i.unit_cost,
          'Total Value': i.total_value,
          Status: i.status,
          Location: i.location || 'N/A',
        })),
        'inventory-report'
      )
    } else if (reportType === 'refunds' && refundsData) {
      exportToExcel(
        refundsData.refunds.map((r: any) => ({
          'Date Refunded': formatDate(r.updated_at),
          Tenant: r.tenants?.name || 'N/A',
          'Tenant Phone': r.tenants?.phone || 'N/A',
          Unit: r.units?.unit_number || 'N/A',
          Building: r.units?.buildings?.name || 'N/A',
          'Deposit Amount': r.amount,
          Deductions: r.total_deductions || 0,
          'Refund Amount': r.refund_amount || 0,
        })),
        'refunds-report'
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">Reports</h1>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExportExcel}
            className="btn btn-primary flex items-center gap-2"
          >
            <FileSpreadsheet size={20} />
            Export to Excel
          </button>
          <button
            onClick={async () => {
              const filename = `${reportType}-report-${startDate}-${endDate}.pdf`
              // Export the main report card area
              await exportElementToPDF('report-area', filename)
            }}
            className="btn btn-outline flex items-center gap-2"
          >
            <FileText size={18} />
            Export as PDF
          </button>
        </div>
      </div>

      <div className="card" id="report-area">
        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setReportType('revenue')}
            className={`btn ${reportType === 'revenue' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Revenue
          </button>
          <button
            onClick={() => setReportType('arrears')}
            className={`btn ${reportType === 'arrears' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Arrears
          </button>
          <button
            onClick={() => setReportType('occupancy')}
            className={`btn ${reportType === 'occupancy' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Occupancy
          </button>
          <button
            onClick={() => setReportType('salaries')}
            className={`btn ${reportType === 'salaries' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Salaries
          </button>
          <button
            onClick={() => setReportType('expenses')}
            className={`btn ${reportType === 'expenses' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Expenses
          </button>
          <button
            onClick={() => setReportType('inventory')}
            className={`btn ${reportType === 'inventory' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Inventory
          </button>
          <button
            onClick={() => setReportType('financial')}
            className={`btn ${reportType === 'financial' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Financial Summary
          </button>
          <button
            onClick={() => setReportType('refunds')}
            className={`btn ${reportType === 'refunds' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Security Deposit Refunds
          </button>
        </div>

        {reportType === 'revenue' && (
          <div className="space-y-6">
            {revenueError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-semibold text-red-900 mb-1">Error loading revenue report</p>
                <p className="text-sm text-red-700">{revenueError.message || 'Failed to load revenue data. Please check your Supabase configuration.'}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800 mb-1">Total Revenue</p>
              <p className="text-xl font-bold text-green-900">
                {formatCurrency(revenueData?.total || 0)}
              </p>
            </div>

            {/* Revenue Chart */}
            {revenueData && revenueData.payments && revenueData.payments.length > 0 && (
              <div className="card mb-6">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-50 mb-4">Revenue Trends</h3>
                <RevenueChart 
                  data={(() => {
                    // Group payments by month
                    const monthlyData: Record<string, number> = {}
                    revenueData.payments.forEach((payment: any) => {
                      const date = new Date(payment.payment_date)
                      const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                      monthlyData[monthKey] = (monthlyData[monthKey] || 0) + (payment.amount || 0)
                    })
                    return Object.entries(monthlyData)
                      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
                      .map(([month, revenue]) => ({ month, revenue }))
                  })()}
                />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Tenant</th>
                    <th>Unit</th>
                    <th>Amount</th>
                    <th>Method</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueData?.payments.map((payment: any) => (
                    <tr key={payment.id}>
                      <td data-label="Date">{formatDate(payment.payment_date)}</td>
                      <td data-label="Tenant">{payment.tenants?.name || 'N/A'}</td>
                      <td data-label="Unit">
                        {payment.units?.unit_number} ({payment.units?.buildings?.name})
                      </td>
                      <td data-label="Amount" className="font-semibold">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td data-label="Method">
                        <span className="badge badge-info capitalize">
                          {payment.payment_method}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportType === 'arrears' && (
          <div className="space-y-6">
            {arrearsError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-semibold text-red-900 mb-1">Error loading arrears report</p>
                <p className="text-sm text-red-700">{arrearsError.message || 'Failed to load arrears data. Please check your Supabase configuration.'}</p>
              </div>
            )}

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 dark:text-red-300 mb-1">Total Outstanding</p>
              <p className="text-xl font-bold text-red-900 dark:text-red-200">
                {formatCurrency(arrearsData?.total || 0)}
              </p>
              <p className="text-xs text-red-700 dark:text-red-400 mt-2">
                This is the total unpaid balance across all bills (balance = total_amount - amount_paid)
              </p>
            </div>

            {arrearsData && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-blue-300">Current</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-blue-100">
                      {arrearsData.aging.current.length}
                    </p>
                  </div>
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-yellow-300">1-30 Days</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-yellow-100">
                      {arrearsData.aging['30days'].length}
                    </p>
                  </div>
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-orange-300">31-60 Days</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-orange-100">
                      {arrearsData.aging['60days'].length}
                    </p>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-red-300">60+ Days</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-red-100">
                      {arrearsData.aging['90days'].length}
                    </p>
                  </div>
                </div>

                {/* Arrears Aging Chart */}
                <div className="card mb-6">
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-50 mb-4">Arrears Aging Analysis</h3>
                  <ArrearsAgingChart 
                    data={[
                      {
                        period: 'Current',
                        count: arrearsData.aging.current.length,
                        amount: arrearsData.aging.current.reduce((sum: number, b: any) => sum + (b.balance || 0), 0)
                      },
                      {
                        period: '1-30 Days',
                        count: arrearsData.aging['30days'].length,
                        amount: arrearsData.aging['30days'].reduce((sum: number, b: any) => sum + (b.balance || 0), 0)
                      },
                      {
                        period: '31-60 Days',
                        count: arrearsData.aging['60days'].length,
                        amount: arrearsData.aging['60days'].reduce((sum: number, b: any) => sum + (b.balance || 0), 0)
                      },
                      {
                        period: '60+ Days',
                        count: arrearsData.aging['90days'].length,
                        amount: arrearsData.aging['90days'].reduce((sum: number, b: any) => sum + (b.balance || 0), 0)
                      }
                    ]}
                  />
                </div>
              </>
            )}

            <div className="overflow-x-auto">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Billing Month</th>
                    <th>Tenant</th>
                    <th>Unit</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {arrearsData?.bills.map((bill: any) => (
                    <tr key={bill.id}>
                      <td data-label="Billing Month">{bill.billing_month}</td>
                      <td data-label="Tenant">{bill.tenants?.name || 'N/A'}</td>
                      <td data-label="Unit">
                        {bill.units?.unit_number} ({bill.units?.buildings?.name})
                      </td>
                      <td data-label="Total">{formatCurrency(bill.total_amount)}</td>
                      <td data-label="Paid" className="text-green-600">
                        {formatCurrency(bill.amount_paid)}
                      </td>
                      <td data-label="Balance" className="font-semibold text-red-600">
                        {formatCurrency(bill.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportType === 'occupancy' && (
          <div className="space-y-6">
            {occupancyError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm font-semibold text-red-900 mb-1">Error loading occupancy report</p>
                <p className="text-sm text-red-700">{occupancyError.message || 'Failed to load occupancy data. Please check your Supabase configuration.'}</p>
              </div>
            )}

            {occupancyData && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-blue-300">Total Units</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-blue-100">{occupancyData.total}</p>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-green-300">Occupied</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      {occupancyData.occupied}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-zinc-300">Occupancy Rate</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-zinc-100">{occupancyData.occupancyRate}%</p>
                  </div>
                </div>

                {/* Occupancy Chart */}
                <div className="card mb-6">
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-50 mb-4">Occupancy Visualization</h3>
                  <OccupancyChart 
                    occupied={occupancyData.occupied}
                    vacant={occupancyData.vacant}
                  />
                </div>

            <div className="overflow-x-auto">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Unit Number</th>
                    <th>Building</th>
                    <th>Status</th>
                    <th>Tenant</th>
                    <th>Monthly Rent</th>
                  </tr>
                </thead>
                <tbody>
                  {occupancyData.units.map((unit: any) => (
                    <tr key={unit.id}>
                      <td data-label="Unit Number" className="font-medium">{unit.unit_number}</td>
                      <td data-label="Building">{unit.buildings?.name || 'N/A'}</td>
                      <td data-label="Status">
                        <span
                          className={`badge ${
                            unit.status === 'occupied'
                              ? 'badge-success'
                              : 'badge-warning'
                          }`}
                        >
                          {unit.status}
                        </span>
                      </td>
                      <td data-label="Tenant">{unit.tenants?.name || 'Vacant'}</td>
                      <td data-label="Monthly Rent" className="font-semibold">
                        {formatCurrency(unit.monthly_rent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </>
            )}
          </div>
        )}

        {reportType === 'salaries' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
              </div>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-1">Total Salaries</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-200">{formatCurrency(salariesData?.total || 0)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Employee</th>
                    <th>Position</th>
                    <th>Base Salary</th>
                    <th>Bonuses</th>
                    <th>Deductions</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salariesData?.salaries.map((salary: any) => (
                    <tr key={salary.id}>
                      <td data-label="Month">{new Date(salary.salary_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td>
                      <td data-label="Employee" className="font-medium">{salary.employees?.name || 'N/A'}</td>
                      <td data-label="Position">{salary.employees?.position || 'N/A'}</td>
                      <td data-label="Base Salary">{formatCurrency(salary.base_salary)}</td>
                      <td data-label="Bonuses">{formatCurrency(salary.bonuses)}</td>
                      <td data-label="Deductions">{formatCurrency(salary.deductions)}</td>
                      <td className="font-semibold">{formatCurrency(salary.total_amount)}</td>
                      <td>{formatCurrency(salary.amount_paid)}</td>
                      <td>{formatCurrency(salary.balance)}</td>
                      <td>
                        <span className={`badge ${
                          salary.status === 'paid' ? 'badge-success' :
                          salary.status === 'partial' ? 'badge-warning' : 'badge-danger'
                        }`}>
                          {salary.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportType === 'expenses' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
              </div>
            </div>
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800 dark:text-red-300 mb-1">Total Expenses</p>
              <p className="text-xl font-bold text-red-900 dark:text-red-200">{formatCurrency(expensesData?.total || 0)}</p>
            </div>

            {/* Expense Breakdown Chart */}
            {expensesData && expensesData.expenses && expensesData.expenses.length > 0 && (
              <div className="card mb-6">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-50 mb-4">Expense Breakdown by Category</h3>
                <ExpenseBreakdownChart 
                  data={(() => {
                    const categoryData: Record<string, number> = {}
                    expensesData.expenses.forEach((expense: any) => {
                      const category = expense.category || 'Uncategorized'
                      categoryData[category] = (categoryData[category] || 0) + (expense.amount || 0)
                    })
                    return Object.entries(categoryData)
                      .map(([category, amount]) => ({ category, amount }))
                      .sort((a, b) => b.amount - a.amount)
                  })()}
                />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {expensesData?.expenses.map((expense: any) => (
                    <tr key={expense.id}>
                      <td data-label="Date">{formatDate(expense.expense_date)}</td>
                      <td data-label="Description" className="font-medium">{expense.description}</td>
                      <td data-label="Category"><span className="badge badge-info">{expense.category}</span></td>
                      <td data-label="Amount" className="font-semibold">{formatCurrency(expense.amount)}</td>
                      <td data-label="Vendor">{expense.vendor || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportType === 'inventory' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400">Total Items</p>
                <p className="text-xl font-bold">{inventoryData?.items.length || 0}</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400">Total Value</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(inventoryData?.totalValue || 0)}</p>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400">Low Stock Items</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{inventoryData?.lowStockCount || 0}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Item Name</th>
                    <th>Category</th>
                    <th>Quantity</th>
                    <th>Unit Cost</th>
                    <th>Total Value</th>
                    <th>Status</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryData?.items.map((item: any) => (
                    <tr key={item.id}>
                      <td data-label="Item Name" className="font-medium">{item.item_name}</td>
                      <td data-label="Category">{item.category || '-'}</td>
                      <td data-label="Quantity">{item.quantity} {item.unit}</td>
                      <td data-label="Unit Cost">{formatCurrency(item.unit_cost)}</td>
                      <td data-label="Total Value" className="font-semibold">{formatCurrency(item.total_value)}</td>
                      <td data-label="Status">
                        <span className={`badge ${
                          item.status === 'in_stock' ? 'badge-success' :
                          item.status === 'low_stock' ? 'badge-warning' : 'badge-danger'
                        }`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{item.location || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {reportType === 'financial' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="p-4 bg-green-50 dark:bg-green-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">Total Revenue</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(financialData?.revenue || 0)}</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">Total Expenses</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(financialData?.expenses || 0)}</p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">Total Salaries</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(financialData?.salaries || 0)}</p>
              </div>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">Security Deposit Refunds</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(financialData?.refunds || 0)}</p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-950/40 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">Security Deposits Held</p>
                <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{formatCurrency(depositsHeldData?.netHeld || 0)}</p>
                <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">{depositsHeldData?.count || 0} active deposits</p>
              </div>
              <div className={`p-4 rounded-lg ${(financialData?.netProfit || 0) >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-red-50 dark:bg-red-950/40'}`}>
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">Net Profit</p>
                <p className={`text-lg font-bold ${(financialData?.netProfit || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrency(financialData?.netProfit || 0)}
                </p>
              </div>
            </div>

            {/* Financial Overview Chart */}
            {financialData && (
              <div className="card mb-6">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-zinc-50 mb-4">Financial Overview</h3>
                <FinancialOverviewChart 
                  data={(() => {
                    // Group by month for the selected date range
                    const monthlyData: Record<string, { revenue: number; expenses: number; salaries: number; refunds: number }> = {}
                    
                    // This is a simplified version - in a real scenario, you'd fetch monthly data
                    // For now, we'll show a single period summary
                    const start = new Date(startDate)
                    const end = new Date(endDate)
                    const monthKey = `${start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
                    
                    monthlyData[monthKey] = {
                      revenue: financialData.revenue || 0,
                      expenses: financialData.expenses || 0,
                      salaries: financialData.salaries || 0,
                      refunds: financialData.refunds || 0
                    }
                    
                    return Object.entries(monthlyData).map(([month, data]) => ({
                      month,
                      revenue: data.revenue,
                      expenses: data.expenses + data.salaries + data.refunds,
                      profit: data.revenue - data.expenses - data.salaries - data.refunds
                    }))
                  })()}
                />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-50 dark:bg-zinc-900 rounded-xl">
                <h3 className="font-semibold text-slate-900 dark:text-zinc-50 mb-4">Period Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Revenue:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(financialData?.revenue || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Expenses:</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">-{formatCurrency(financialData?.expenses || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Salaries:</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">-{formatCurrency(financialData?.salaries || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Security Deposit Refunds:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">-{formatCurrency(financialData?.refunds || 0)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex justify-between">
                    <span className="font-bold text-slate-900 dark:text-zinc-50">Net Profit:</span>
                    <span className={`font-bold ${(financialData?.netProfit || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {formatCurrency(financialData?.netProfit || 0)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-purple-50 dark:bg-purple-950/40 rounded-xl">
                <h3 className="font-semibold text-slate-900 dark:text-zinc-50 mb-4">Security Deposits Held</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Total Deposits:</span>
                    <span className="font-semibold text-purple-600 dark:text-purple-400">{formatCurrency(depositsHeldData?.totalHeld || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-zinc-400">Total Deductions:</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">-{formatCurrency(depositsHeldData?.totalDeductions || 0)}</span>
                  </div>
                  <div className="pt-2 border-t border-purple-200 dark:border-purple-800 flex justify-between">
                    <span className="font-bold text-slate-900 dark:text-zinc-50">Net Held:</span>
                    <span className="font-bold text-purple-600 dark:text-purple-400">
                      {formatCurrency(depositsHeldData?.netHeld || 0)}
                    </span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-800">
                    <p className="text-sm text-slate-600 dark:text-zinc-400">
                      Active Deposits: <span className="font-semibold text-purple-600 dark:text-purple-400">{depositsHeldData?.count || 0}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {reportType === 'refunds' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-zinc-200 mb-2">End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => {
                    // Set date range to last 20 years to show all refunds
                    const twentyYearsAgo = new Date()
                    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20)
                    setStartDate(twentyYearsAgo.toISOString().split('T')[0])
                    setEndDate(new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                  }}
                  className="btn btn-secondary text-sm"
                >
                  Show All Refunds
                </button>
              </div>
            </div>
            
            {refundsData && refundsData.allRefundedCount > refundsData.refunds.length && (
              <div className="bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800/50 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  <strong>Note:</strong> There are {refundsData.allRefundedCount} total refunds, but only {refundsData.refunds.length} are shown in the selected date range. 
                  Click "Show All Refunds" to see all refunds.
                </p>
              </div>
            )}
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-lg p-4 mb-6">
              <p className="text-sm text-emerald-800 dark:text-emerald-300 mb-1">Total Refunds</p>
              <p className="text-xl font-bold text-emerald-900 dark:text-emerald-200">
                {formatCurrency(refundsData?.total || 0)}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="table responsive-table">
                <thead>
                  <tr>
                    <th>Date Refunded</th>
                    <th>Tenant</th>
                    <th>Unit</th>
                    <th>Deposit Amount</th>
                    <th>Deductions</th>
                    <th>Refund Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {refundsData?.refunds.map((refund: any) => (
                    <tr key={refund.id}>
                      <td data-label="Date Refunded">{formatDate(refund.updated_at)}</td>
                      <td data-label="Tenant">
                        <div>
                          <div className="font-medium">{refund.tenants?.name || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{refund.tenants?.phone || ''}</div>
                        </div>
                      </td>
                      <td data-label="Unit">
                        {refund.units?.unit_number || 'N/A'} 
                        {refund.units?.buildings?.name && ` (${refund.units.buildings.name})`}
                      </td>
                      <td data-label="Deposit Amount">{formatCurrency(refund.amount)}</td>
                      <td data-label="Deductions" className="text-red-600 dark:text-red-400">
                        {formatCurrency(refund.total_deductions || 0)}
                      </td>
                      <td data-label="Refund Amount" className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(refund.refund_amount || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

