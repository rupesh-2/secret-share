import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * Server-side envelope encryption (design §2).
 *
 * Each secret value is encrypted with a fresh 256-bit data key (DEK); the DEK is
 * then wrapped by a master key (KEK). Only the wrapped DEK and ciphertext are
 * stored — the plaintext DEK exists only for the duration of a call.
 *
 * DEV NOTE: the KEK is read from `VAULT_KEK` (a base64 32-byte key) as a stand-in
 * for a cloud KMS. The production swap is to move wrap/unwrap behind KMS
 * GenerateDataKey / Decrypt; the on-disk shape (wrapped_dek, kek_id) is unchanged,
 * so stored rows migrate by re-wrapping, not re-encrypting. See roadmap step 03.
 */

const ALG = "aes-256-gcm";
const IV_BYTES = 12;
const DEK_BYTES = 32;

export const KEK_ID = "env-v1";

function kek(): Buffer {
  const b64 = process.env.VAULT_KEK;
  if (!b64) throw new Error("VAULT_KEK is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("VAULT_KEK must be 32 bytes (base64)");
  return key;
}

/** AES-256-GCM. Returns iv‖tag‖ciphertext packed into one base64 string. */
function seal(key: Buffer, plaintext: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Inverse of `seal`. */
function open(key: Buffer, packed: string): Buffer {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + 16);
  const ct = buf.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export interface SealedValue {
  ciphertext: string; // base64 iv‖tag‖ct of the value under the DEK
  wrappedDek: string; // base64 iv‖tag‖ct of the DEK under the KEK
  kekId: string;
}

/** Encrypt a secret value: fresh DEK, wrapped by the KEK. */
export function encryptValue(plaintext: string): SealedValue {
  const dek = randomBytes(DEK_BYTES);
  try {
    const ciphertext = seal(dek, Buffer.from(plaintext, "utf8"));
    const wrappedDek = seal(kek(), dek);
    return { ciphertext, wrappedDek, kekId: KEK_ID };
  } finally {
    dek.fill(0); // wipe the plaintext DEK from memory
  }
}

/** Decrypt a secret value by unwrapping its DEK with the KEK. */
export function decryptValue(sealed: SealedValue): string {
  if (sealed.kekId !== KEK_ID) {
    throw new Error(`unknown KEK id: ${sealed.kekId}`);
  }
  const dek = open(kek(), sealed.wrappedDek);
  try {
    return open(dek, sealed.ciphertext).toString("utf8");
  } finally {
    dek.fill(0);
  }
}
