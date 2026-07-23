"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { buttonClass } from "../ui";

export default function GoogleButton() {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // hd hints Google to the org account; the domain is still enforced
        // server-side and in the DB — never trusted from the client alone.
        queryParams: { hd: "inseed.dev", prompt: "select_account" },
      },
    });
    if (error) {
      setBusy(false);
      location.href = "/signin?error=exchange";
    }
  }

  return (
    <button className={buttonClass} onClick={signIn} disabled={busy}>
      {busy ? "Redirecting…" : "Sign in with Google"}
    </button>
  );
}
