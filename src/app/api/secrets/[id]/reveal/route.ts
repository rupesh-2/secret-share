import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { decryptValue } from "@/lib/crypto/envelope";

export const runtime = "nodejs";

/**
 * Reveal a vault secret's current value. RLS decides whether the caller may
 * read the row; envelope decryption happens here and the plaintext is returned
 * over TLS, never logged. The read is recorded as `secret_viewed`.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("secret_values")
    .select("ciphertext,wrapped_dek,kek_id")
    .eq("secret_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const row = data as {
    ciphertext: string;
    wrapped_dek: string;
    kek_id: string;
  };

  let value: string;
  try {
    value = decryptValue({
      ciphertext: row.ciphertext,
      wrappedDek: row.wrapped_dek,
      kekId: row.kek_id,
    });
  } catch {
    return NextResponse.json({ error: "decrypt failed" }, { status: 500 });
  }

  await supabase.rpc("write_audit", {
    p_event: "secret_viewed",
    p_target_type: "secret",
    p_target_id: id,
  });

  return NextResponse.json({ value });
}
