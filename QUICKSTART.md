# Quick Start Guide

Get your Property Management PWA up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a project
2. Open SQL Editor in your Supabase dashboard
3. Copy and paste the entire `supabase-schema.sql` file
4. Click "Run" to execute
5. Go to Storage → Create buckets:
   - `tenant-photos` (set as Public)
   - `receipts` (set as Public)

## Step 3: Configure Supabase (Optional)

If you want to use environment variables instead of hardcoded keys:

1. Create a `.env` file in the root directory:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

2. Update `src/lib/supabase.ts` to use environment variables:
   ```typescript
   const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'your-default-url'
   const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-default-key'
   ```

## Step 4: Run the App

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Step 5: Create Your First Account

1. Open the app in your browser
2. Click "Sign up" or go to `/register`
3. Create an account with your email and password
4. Start adding buildings, units, and tenants!

## That's It! 🎉

You're ready to manage properties. Check out the [README.md](./README.md) for more details.

## Troubleshooting

**Can't connect to Supabase?**
- Verify your Supabase URL and key are correct
- Check that your Supabase project is active
- Ensure RLS policies are set up correctly

**Build errors?**
- Make sure Node.js 18+ is installed
- Delete `node_modules` and run `npm install` again
- Check for TypeScript errors: `npm run build`

**File uploads not working?**
- Verify storage buckets are created and set to Public
- Check storage policies in Supabase
- Ensure you're logged in

