import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES RLS — use only in trusted server code
 * for operations that must not be gated by the caller's permissions: auth-hook
 * side effects, append-only audit_log inserts, and admin user management.
 *
 * Never import this into a Client Component or expose its results directly to a
 * user without re-checking authorization yourself.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
