import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewForm from "./new-form";

export default async function NewSecret() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  return <NewForm />;
}
