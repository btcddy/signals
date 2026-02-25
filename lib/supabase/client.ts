import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Browser client — uses anon key, respects RLS
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);

// Server client — still uses anon key but from server context
// Use this in API routes where you want RLS enforced with the user's JWT
export function createServerClient(accessToken?: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  });
}

// Admin client — uses service role key, BYPASSES RLS
// Only use in cron jobs, server-side operations, and trusted contexts
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
