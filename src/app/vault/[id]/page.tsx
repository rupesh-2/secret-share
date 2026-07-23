import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RevealPanel, { type SecretMeta } from "./reveal-panel";

export default async function SecretDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data, error } = await supabase
    .from("secrets")
    .select("id,type,title,username,url,description,updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) notFound();

  return <RevealPanel secret={data as SecretMeta} />;
}
