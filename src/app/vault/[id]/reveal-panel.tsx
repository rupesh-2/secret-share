"use client";

import { useState } from "react";
import Link from "next/link";
import { copyWithAutoClear } from "@/lib/clipboard";
import { Card, ErrorNote, Sub, Title, buttonClass } from "../../ui";

export interface SecretMeta {
  id: string;
  type: string;
  title: string;
  username: string | null;
  url: string | null;
  description: string | null;
  updated_at: string;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-100 py-2 text-sm dark:border-neutral-800">
      <span className="text-neutral-500">{label}</span>
      <span className="truncate text-neutral-900 dark:text-neutral-100">{value}</span>
    </div>
  );
}

export default function RevealPanel({ secret }: { secret: SecretMeta }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/secrets/${secret.id}/reveal`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Could not reveal.");
      }
      const { value } = await res.json();
      setValue(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (value == null) return;
    await copyWithAutoClear(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <Title>{secret.title}</Title>
        <Link href="/" className="text-xs text-neutral-500 underline underline-offset-2">
          Back
        </Link>
      </div>
      {secret.description && <Sub>{secret.description}</Sub>}

      <div className="mt-5">
        {secret.username && <Field label="Username" value={secret.username} />}
        {secret.url && <Field label="URL" value={secret.url} />}
      </div>

      <div className="mt-5">
        {value == null ? (
          <button className={buttonClass} onClick={reveal} disabled={busy}>
            {busy ? "Decrypting…" : "Reveal secret"}
          </button>
        ) : (
          <div className="space-y-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-sm dark:border-neutral-800 dark:bg-neutral-950">
              {value}
            </pre>
            <div className="flex gap-2">
              <button className={buttonClass} onClick={copy}>
                {copied ? "Copied — clears in 30s" : "Copy"}
              </button>
              <button
                className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                onClick={() => setValue(null)}
              >
                Hide
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </Card>
  );
}
