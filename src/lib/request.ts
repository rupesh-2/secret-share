/**
 * Trust the leftmost x-forwarded-for hop only when we know a proxy set it.
 * On Vercel/Cloudflare that header is rewritten per-request; behind a bare
 * Node server a client can forge it, so we fall back to null rather than
 * writing an attacker-chosen value into the audit log.
 */
export function clientIp(req: Request): string | null {
  if (process.env.TRUST_PROXY !== "1") return null;
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || null;
}
