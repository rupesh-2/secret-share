import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./keys";

/** Paths reachable without a session: sign-in, the OAuth callback, and the
 *  public one-time reveal surface. Everything else requires auth. */
function isPublic(path: string): boolean {
  return (
    path === "/signin" ||
    path.startsWith("/auth/") ||
    path.startsWith("/s/") ||
    path.startsWith("/api/one-time")
  );
}

/**
 * Refresh the Supabase session on every request and gate protected routes.
 * Runs in middleware so token rotation is persisted to cookies (Server
 * Components can read the session but cannot write refreshed tokens).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() revalidates the token with Supabase — do not trust getSession() here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  return response;
}
