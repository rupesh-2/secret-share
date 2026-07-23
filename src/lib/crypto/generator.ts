/**
 * Client-side password generator. Uses `crypto.getRandomValues` with rejection
 * sampling so the character distribution is uniform (no modulo bias).
 */

export interface GenOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  number: boolean;
  symbol: boolean;
}

// Ambiguous glyphs (0/O, 1/l/I) are omitted so generated secrets transcribe cleanly.
const SETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnpqrstuvwxyz",
  number: "23456789",
  symbol: "!@#$%^&*-_=+?",
};

/** Uniform index in [0, max) via rejection sampling. */
function randIndex(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

export function generatePassword(o: GenOptions): string {
  const pool =
    (o.upper ? SETS.upper : "") +
    (o.lower ? SETS.lower : "") +
    (o.number ? SETS.number : "") +
    (o.symbol ? SETS.symbol : "");
  if (!pool) return "";
  const len = Math.max(1, Math.min(128, o.length));
  let out = "";
  for (let i = 0; i < len; i++) out += pool[randIndex(pool.length)];
  return out;
}

/** A short, memorable passphrase from a compact embedded word list. */
const WORDS =
  "able acid aqua arch atom aura bald bark barn bead beam bean bear beat beef bell belt bird blue boat bold bolt bone book boot brew brick bulb cake calm cane card cave chef chip city clay coal coin cold cord core corn crop cube cure dawn deer desk dial dime dock dove drum dust echo edge fern film fire fish flag flax foam fold fork frog fuel gate gear gift gold gulf hall hawk herb hill hive hood horn iris iron ivy jade jazz kelp kite lace lake lamp lava leaf lens lily lime lion loft loom lung mane maple mask mint mist moon moss moth nest node oath oak oat onyx opal palm peak pear pine plum pond pony reed reef rice ring rope rose ruby rust sage salt sand seal silk snow soap sofa star swan tide tile tint toad tone tulip tuna vase vine wave wolf wren yarn zinc".split(
    " ",
  );

export function generatePassphrase(words = 4, sep = "-"): string {
  const n = Math.max(3, Math.min(10, words));
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(WORDS[randIndex(WORDS.length)]);
  // Sprinkle a digit so it satisfies "must contain a number" policies.
  out.push(String(randIndex(90) + 10));
  return out.join(sep);
}
