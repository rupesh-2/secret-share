import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Uniform over 000000-999999 (randomInt is rejection-sampled, not modulo-biased). */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function pepper(): string {
  const p = process.env.OTP_PEPPER;
  if (!p) throw new Error("OTP_PEPPER is not set");
  return p;
}

/**
 * Codes are only 6 digits, so a bare hash would fall to an offline sweep of the
 * whole keyspace if the table leaked. The pepper lives in env, not the DB.
 */
export function hashCode(secretId: string, email: string, code: string): string {
  return createHash("sha256")
    .update(`${pepper()}:${secretId}:${email.toLowerCase()}:${code}`)
    .digest("hex");
}

export function codesMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
