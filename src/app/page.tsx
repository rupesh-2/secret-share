import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard, { type SecretRow } from "./dashboard";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data, error } = await supabase
    .from("secrets")
    .select("id,title,type,username,url,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  return (
    <Dashboard
      email={user.email ?? ""}
      secrets={(data ?? []) as SecretRow[]}
      dbReady={!error}
    />
  );
}
