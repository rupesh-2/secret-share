"use client";

import { useState } from "react";
import { encrypt } from "@/lib/crypto";
import {
  Card,
  ErrorNote,
  Label,
  Sub,
  Title,
  buttonClass,
  fieldClass,
} from "./ui";

const TTL_OPTIONS = [
  { hours: 1, text: "1 hour" },
  { hours: 24, text: "24 hours" },
  { hours: 72, text: "3 days" },
  { hours: 168, text: "7 days" },
];

function parseEmails(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export default function CreateForm() {
  const [label, setLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [emails, setEmails] = useState("");
  const [ttlHours, setTtlHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const allowedEmails = parseEmails(emails);
    if (!secret.trim()) return setError("Enter the secret you want to send.");
    if (allowedEmails.length === 0)
      return setError("Add at least one recipient email address.");

    setBusy(true);
    try {
      // Encrypt before anything leaves the tab. The server receives ciphertext
      // and never sees `keyMaterial`.
      const { ciphertext, iv, keyMaterial } = await encrypt(secret);

      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, ciphertext, iv, allowedEmails, ttlHours }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "request failed");
      const { id } = await res.json();

      // The key sits after the '#', so it is never sent in the HTTP request
      // for this URL — not to us, not to a proxy, not into an access log.
      setLink(`${location.origin}/s/${id}#${keyMaterial}`);
      setSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    return (
      <Card>
        <Title>Link ready</Title>
        <Sub>
          Copy it now — this is the only time it will be shown. Opening it once
          destroys the secret.
        </Sub>
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <code className="block break-all font-mono text-xs">{link}</code>
        </div>
        <button
          className={`${buttonClass} mt-4`}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          className="mt-3 w-full text-sm text-neutral-500 underline underline-offset-2"
          onClick={() => {
            setLink(null);
            setLabel("");
            setEmails("");
          }}
        >
          Share another
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <Title>Share a secret</Title>
      <Sub>
        Encrypted in this tab, opened once, then destroyed. We never hold the
        key.
      </Sub>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="label">What is it?</Label>
          <input
            id="label"
            className={fieldClass}
            placeholder="Staging DB password"
            value={label}
            maxLength={120}
            onChange={(e) => setLabel(e.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Shown in the email. Don&apos;t put the secret itself here.
          </p>
        </div>

        <div>
          <Label htmlFor="secret">Secret</Label>
          <textarea
            id="secret"
            className={`${fieldClass} h-28 resize-y font-mono`}
            placeholder="hunter2 / -----BEGIN PRIVATE KEY-----"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="emails">Who may open it?</Label>
          <input
            id="emails"
            className={fieldClass}
            placeholder="client@acme.com, ops@acme.com"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Each must prove control of their inbox with a emailed code. Anyone
            else with the link gets nothing.
          </p>
        </div>

        <div>
          <Label htmlFor="ttl">Expires after</Label>
          <select
            id="ttl"
            className={fieldClass}
            value={ttlHours}
            onChange={(e) => setTtlHours(Number(e.target.value))}
          >
            {TTL_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.text}
              </option>
            ))}
          </select>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Encrypting…" : "Create link"}
        </button>
      </form>
    </Card>
  );
}
