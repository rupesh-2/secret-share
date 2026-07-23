import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const Body = z.object({
  email: z.email(),
  permission: z.enum(["read", "edit"]),
});

/** Share a secret with another Inseed user. Owner-only (enforced in the RPC). */
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

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error } = await supabase.rpc("share_secret", {
    p_secret_id: id,
    p_grantee_email: parsed.data.email,
    p_permission: parsed.data.permission,
  });

  if (error) {
    // The RPC's raised message is user-facing ("no Inseed user with that
    // email has signed in yet", "only the owner can share this secret", ...).
    return NextResponse.json(
      { error: error.message || "could not share" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
