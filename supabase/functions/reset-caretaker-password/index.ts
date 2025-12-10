// Supabase Edge Function to reset caretaker password
// This uses the service role key to update the actual auth password

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Create Supabase client with service role key (from environment)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the requesting user is authenticated
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Parse request body
    const { caretaker_id, user_id, new_password } = await req.json()

    if (!caretaker_id || !user_id || !new_password) {
      throw new Error('Missing required fields: caretaker_id, user_id, new_password')
    }

    // Verify the caretaker exists and belongs to the requesting user
    const { data: caretaker, error: caretakerError } = await supabaseAdmin
      .from('caretakers')
      .select('id, created_by')
      .eq('id', caretaker_id)
      .single()

    if (caretakerError || !caretaker) {
      throw new Error('Caretaker not found')
    }

    // Verify the requesting user created this caretaker
    if (caretaker.created_by !== user.id) {
      throw new Error('Unauthorized: You can only reset passwords for caretakers you created')
    }

    // Update the auth password using admin API
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user_id,
      { password: new_password }
    )

    if (updateError) {
      throw new Error(`Failed to update auth password: ${updateError.message}`)
    }

    // Update the password hash in the caretakers table
    const passwordHash = btoa(new_password)
    const { error: hashError } = await supabaseAdmin
      .from('caretakers')
      .update({ password_hash: passwordHash })
      .eq('id', caretaker_id)

    if (hashError) {
      console.warn('Failed to update password hash in database:', hashError)
      // Don't throw - the auth password was updated successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

