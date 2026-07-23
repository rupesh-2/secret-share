import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { sendOtpEmail } from "@/lib/mail";
import { generateCode, hashCode, normalizeEmail, OTP_TTL_MINUTES } from "@/lib/otp";
import { clientIp } from "@/lib/request";

export const runtime = "nodejs";

const Body = z.object({ email: z.email() });

const MAX_CHALLENGES_PER_WINDOW = 5;

/**
 * Always answers 200 with the same body. Whether the id exists, is already
 * burned, or lists this address are all facts we refuse to confirm to an
 * unauthenticated caller — otherwise this endpoint becomes a recipient oracle.
 */
const ok = () => NextResponse.json({ ok: true });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return ok();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return ok();
  const email = normalizeEmail(parsed.data.email);

  const [secret] = await sql<{ id: string; label: string }[]>`
    select id, label from secrets
    where id = ${id}
      and viewed_at is null
      and expires_at > now()
      and ${email} = any (allowed_emails)
  `;
  if (!secret) return ok();

  const [{ count }] = await sql<{ count: string }[]>`
    select count(*) from otp_challenges
    where secret_id = ${id}
      and email = ${email}
      and created_at > now() - interval '10 minutes'
  `;
  if (Number(count) >= MAX_CHALLENGES_PER_WINDOW) {
    await sql`
      insert into audit_log (secret_id, event, actor, ip)
      values (${id}, 'challenge_throttled', ${email}, ${clientIp(req)})
    `;
    return ok();
  }

  const code = generateCode();

  // Supersede outstanding codes so only the newest email works. Without this,
  // every resend widens the set of guessable live codes.
  await sql`
    update otp_challenges set consumed_at = now()
    where secret_id = ${id} and email = ${email} and consumed_at is null
  `;
  await sql`
    insert into otp_challenges (secret_id, email, code_hash, expires_at)
    values (${id}, ${email}, ${hashCode(id, email, code)},
            now() + (${OTP_TTL_MINUTES} * interval '1 minute'))
  `;

  try {
    await sendOtpEmail(email, code, secret.label);
  } catch {
    // Don't surface delivery failure — it would confirm the address is listed.
    await sql`
      insert into audit_log (secret_id, event, actor, ip)
      values (${id}, 'challenge_send_failed', ${email}, ${clientIp(req)})
    `;
    return ok();
  }

  await sql`
    insert into audit_log (secret_id, event, actor, ip)
    values (${id}, 'challenge_sent', ${email}, ${clientIp(req)})
  `;
  return ok();
}
