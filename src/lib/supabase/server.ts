import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client for Server Components, Server Actions, and Route
 * Handlers. Reads/writes the session cookies via Next's async `cookies()` and
 * enforces RLS with the caller's own JWT — this client never bypasses RLS.
 *
 * The `setAll` try/catch is required because Server Components cannot mutate
 * cookies; token refresh writes are a no-op there and get persisted later by
 * middleware instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — safe to ignore; middleware refreshes.
          }
        },
      },
    },
  );
}
