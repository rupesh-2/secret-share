import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Revoke a share. Owner-only (enforced in the RPC). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; shareId: string }> },
) {
  const { shareId } = await params;
  if (!z.uuid().safeParse(shareId).success) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.rpc("revoke_share", { p_share_id: shareId });
  if (error) {
    return NextResponse.json(
      { error: error.message || "could not revoke" },
      { status: 400 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
