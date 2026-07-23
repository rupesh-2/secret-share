import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RevealPanel, { type SecretMeta } from "./reveal-panel";
import ShareManager, { type Share } from "./share-manager";

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
    .select("id,owner_id,type,title,username,url,description,updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) notFound();

  const secret = data as SecretMeta & { owner_id: string };
  const isOwner = secret.owner_id === user.id;

  let shares: Share[] = [];
  if (isOwner) {
    const { data: sh } = await supabase.rpc("list_secret_shares", {
      p_secret_id: id,
    });
    shares = (sh ?? []) as Share[];
  }

  return (
    <div className="space-y-4">
      <RevealPanel secret={secret} />
      {isOwner && <ShareManager secretId={id} shares={shares} />}
    </div>
  );
}
