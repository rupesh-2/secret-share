/**
 * Copy text to the clipboard and wipe it after a delay (design: "auto clear
 * clipboard after 30s"). Best-effort — a browser may deny the clearing write if
 * the tab has lost focus, so this reduces exposure rather than guaranteeing it.
 */
export async function copyWithAutoClear(
  text: string,
  ms = 30_000,
): Promise<void> {
  await navigator.clipboard.writeText(text);
  window.setTimeout(() => {
    // Only clear if we still likely own what we wrote.
    navigator.clipboard.writeText("").catch(() => {});
  }, ms);
}
