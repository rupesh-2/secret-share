"use client";

import dynamic from "next/dynamic";

/**
 * The reveal UI reads the decryption key from `location.hash`, which exists
 * only in the browser. Rendering it on the server would mean guessing at that
 * value and then correcting it after hydration; skipping SSR lets us just read
 * it during render.
 */
const Reveal = dynamic(() => import("./reveal"), { ssr: false });

export default function RevealClient({ id }: { id: string }) {
  return <Reveal id={id} />;
}
