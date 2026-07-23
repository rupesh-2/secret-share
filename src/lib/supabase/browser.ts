import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./keys";

/**
 * Browser-side Supabase client. Safe to call from Client Components; it carries
 * the user's session from the auth cookies and is bound by RLS on every query.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
