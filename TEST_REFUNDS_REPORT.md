# Security Deposit Refunds Report - Testing Guide

## Test Steps

### 1. Process a Security Deposit Refund
1. Navigate to **Security Deposits** page
2. Find an active security deposit
3. Click the "Process Lease End" button (FileText icon)
4. Enter damages amount (if any) and description
5. Click "Process Lease End"
6. Verify success message appears

### 2. Verify Refund Appears in Reports
1. Navigate to **Reports** page
2. Click on **"Security Deposit Refunds"** tab
3. Verify the refund appears in the table with:
   - Correct date refunded
   - Tenant name and phone
   - Unit number and building
   - Deposit amount
   - Deductions
   - Refund amount
4. Verify the total refunds amount is correct

### 3. Check Financial Summary
1. In Reports, click on **"Financial Summary"** tab
2. Verify "Security Deposit Refunds" card shows the correct total
3. Verify refunds are subtracted from Net Profit

### 4. Verify Tenant and Unit Status
1. Navigate to **Tenants** page
2. Verify the refunded tenant is NOT in the list (archived)
3. Navigate to **Units** page
4. Verify the unit is marked as "vacant"

## Expected Console Logs

When processing a refund, you should see:
```
Processing refund: { depositId, amount, totalDeductions, refundAmount, status }
Deposit updated: { depositId, status, updated_at, refundAmount }
```

When viewing refunds report, you should see:
```
Refunds report: { 
  refunds: X, 
  total: Y, 
  startDateTime, 
  endDateTime,
  depositsFound: X,
  sampleDeposit: { id, status, refund_amount, updated_at }
}
```

## Troubleshooting

### If refunds don't appear:
1. Check browser console for errors
2. Verify the date range includes the refund date
3. Check that `updated_at` was set correctly
4. Verify deposit status is 'refunded' in database
5. Check that query invalidation is working

### Common Issues:
- **Date range too narrow**: Default is 12 months, adjust if needed
- **Timezone issues**: All dates use ISO format with timezone
- **Query cache**: Try refreshing the page or switching tabs

## Database Verification

Run this SQL in Supabase to verify refunds:
```sql
SELECT 
  id,
  status,
  amount,
  total_deductions,
  refund_amount,
  updated_at,
  tenant_id,
  unit_id
FROM security_deposits
WHERE status = 'refunded'
ORDER BY updated_at DESC;
```


