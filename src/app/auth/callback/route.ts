import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * OAuth return leg. Exchanges the PKCE code for a session, then enforces the
 * @inseed.dev domain as a second gate (the DB trigger is the first). A rejected
 * account is signed straight back out so no partial session lingers.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/signin?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/signin?error=exchange`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase() ?? "";
  if (!email.endsWith("@inseed.dev")) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/signin?error=domain`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
