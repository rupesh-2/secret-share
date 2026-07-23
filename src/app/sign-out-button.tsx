"use client";

import { createClient } from "@/lib/supabase/browser";

export default function SignOutButton() {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    location.href = "/signin";
  }

  return (
    <button
      onClick={signOut}
      className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
    >
      Sign out
    </button>
  );
}
