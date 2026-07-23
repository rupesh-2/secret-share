/**
 * Browser-side envelope crypto. Everything in this file runs in the client;
 * the raw key must never be sent to the server or written to a URL path/query
 * (fragments are not transmitted in HTTP requests — that is the whole point).
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64Url(new Uint8Array(raw));
}

export async function importKey(material: string): Promise<CryptoKey> {
  const raw = fromBase64Url(material);
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "decrypt",
  ]);
}

export async function encrypt(
  plaintext: string,
): Promise<{ ciphertext: string; iv: string; keyMaterial: string }> {
  const key = await generateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  return {
    ciphertext: toBase64Url(new Uint8Array(buf)),
    iv: toBase64Url(iv),
    keyMaterial: await exportKey(key),
  };
}

export async function decrypt(
  ciphertext: string,
  iv: string,
  keyMaterial: string,
): Promise<string> {
  const key = await importKey(keyMaterial);
  const buf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) as BufferSource },
    key,
    fromBase64Url(ciphertext) as BufferSource,
  );
  return dec.decode(buf);
}
