# Create Caretaker Edge Function

This Supabase Edge Function creates caretaker accounts using admin privileges, bypassing email confirmation requirements.

## Setup

1. Install Supabase CLI: `npm install -g supabase`
2. Login to Supabase: `supabase login`
3. Link your project: `supabase link --project-ref your-project-ref`
4. Deploy the function: `supabase functions deploy create-caretaker`

## Environment Variables

The function uses these environment variables (automatically available in Supabase):
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key (from Supabase Dashboard → Settings → API)

## Usage

The frontend will call this function instead of using `signUp` directly.

