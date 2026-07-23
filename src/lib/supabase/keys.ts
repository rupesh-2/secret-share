/**
 * Shared Supabase connection values. Accepts either env name so the project
 * works with both the older ANON_KEY convention and Supabase's newer
 * PUBLISHABLE_KEY convention (same value, different label).
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
