# Quick Setup Guide

## Step 1: Install Dependencies

```bash
cd property-management-pwa
npm install
```

## Step 2: Set Up Supabase Database

1. Go to https://supabase.com/dashboard
2. Open your project (givbliycdppmfqeahxss)
3. Navigate to **SQL Editor**
4. Copy and paste the entire contents of `supabase-schema.sql`
5. Click **Run** to execute the SQL

## Step 3: Create Storage Buckets

1. In Supabase dashboard, go to **Storage**
2. Click **New bucket**
3. Create bucket named `tenant-photos` (make it **Public**)
4. Create bucket named `receipts` (make it **Public**)

## Step 4: Configure Storage Policies

The SQL script includes storage policies, but if you need to add them manually:

1. Go to **Storage** → **Policies** for each bucket
2. Ensure policies allow authenticated users to read and insert

## Step 5: Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Step 6: Create Your First Account

1. Navigate to the Register page
2. Create an account with your email and password
3. Start adding buildings, units, and tenants!

## Troubleshooting

### "Cannot connect to Supabase"
- Check that your Supabase URL and keys are correct in `src/lib/supabase.ts`
- Ensure your Supabase project is active

### "Permission denied" errors
- Verify RLS policies are set up correctly
- Check that you're authenticated (logged in)
- Review storage bucket policies

### "Storage bucket not found"
- Ensure buckets `tenant-photos` and `receipts` are created
- Verify bucket names match exactly (case-sensitive)

### File uploads not working
- Check storage bucket is set to **Public**
- Verify storage policies allow INSERT and SELECT
- Check file size (should be under 5MB for images)

## Production Deployment

### Build the app:
```bash
npm run build
```

### Deploy to Vercel:
1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables (if using env vars instead of hardcoded keys)
4. Deploy!

The app will work as a PWA once deployed with HTTPS.

