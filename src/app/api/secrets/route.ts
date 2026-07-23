import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { encryptValue } from "@/lib/crypto/envelope";

export const runtime = "nodejs";

const Body = z.object({
  type: z.enum([
    "password",
    "api_key",
    "ssh_key",
    "token",
    "note",
    "env",
    "db_cred",
  ]),
  title: z.string().min(1).max(200),
  username: z.string().max(200).nullish(),
  url: z.string().max(2000).nullish(),
  description: z.string().max(5000).nullish(),
  value: z.string().min(1).max(100_000),
  folderId: z.uuid().nullish(),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const b = parsed.data;

  // Encrypt before the value touches the database. Only ciphertext is stored.
  const sealed = encryptValue(b.value);

  const { data, error } = await supabase.rpc("create_secret", {
    p_type: b.type,
    p_title: b.title,
    p_username: b.username ?? null,
    p_url: b.url ?? null,
    p_description: b.description ?? null,
    p_folder_id: b.folderId ?? null,
    p_ciphertext: sealed.ciphertext,
    p_wrapped_dek: sealed.wrappedDek,
    p_kek_id: sealed.kekId,
  });

  if (error) {
    return NextResponse.json({ error: "could not save secret" }, { status: 500 });
  }

  return NextResponse.json({ id: data }, { status: 201 });
}
