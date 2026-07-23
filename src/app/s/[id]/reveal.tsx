"use client";

import { useEffect, useState } from "react";
import { decrypt } from "@/lib/crypto";
import {
  Card,
  ErrorNote,
  Label,
  Sub,
  Title,
  buttonClass,
  fieldClass,
} from "@/app/ui";

type Stage = "email" | "code" | "revealed" | "nokey";

export default function Reveal({ id }: { id: string }) {
  // Safe to read at render time: this component never runs on the server
  // (see reveal-client.tsx). Captured once, before the effect below strips it.
  const [keyMaterial] = useState(() => location.hash.slice(1));
  const [stage, setStage] = useState<Stage>(keyMaterial ? "email" : "nokey");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState("");
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Drop the key from the address bar so it can't be shoulder-surfed or leak
    // via a screenshot. It stays in memory for this page's lifetime.
    if (keyMaterial) history.replaceState(null, "", location.pathname);
  }, [keyMaterial]);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/secrets/${id}/challenge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Deliberately unconditional: the API won't tell us whether this address
      // is on the list, and neither will this screen.
      setStage("code");
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/secrets/${id}/reveal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "That didn't work.");
        return;
      }
      const text = await decrypt(body.ciphertext, body.iv, keyMaterial);
      setPlaintext(text);
      setLabel(body.label ?? "");
      setStage("revealed");
    } catch {
      // The server burned the secret to hand us this ciphertext, so a decrypt
      // failure here means the link's key is wrong — and it's now unrecoverable.
      setError(
        "The secret was released but couldn't be decrypted — the link may have been truncated. Ask the sender for a new one.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (stage === "nokey") {
    return (
      <Card>
        <Title>Incomplete link</Title>
        <Sub>
          This link is missing its decryption key — the part after the
          &ldquo;#&rdquo;. It was probably clipped when it was copied. Ask the
          sender to send a fresh one.
        </Sub>
      </Card>
    );
  }

  if (stage === "revealed") {
    return (
      <Card>
        <Title>{label || "Your secret"}</Title>
        <Sub>
          This is gone from the server. Copy it now — reloading shows nothing.
        </Sub>
        <pre className="mt-4 max-h-72 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-sm break-all whitespace-pre-wrap dark:border-neutral-800 dark:bg-neutral-950">
          {plaintext}
        </pre>
        <button
          className={`${buttonClass} mt-4`}
          onClick={async () => {
            await navigator.clipboard.writeText(plaintext);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy secret"}
        </button>
      </Card>
    );
  }

  if (stage === "code") {
    return (
      <Card>
        <Title>Check your email</Title>
        <Sub>
          If {email} is authorized to open this, a 6-digit code is on its way.
          It expires in 10 minutes.
        </Sub>
        <form onSubmit={submitCode} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="code">Code</Label>
            <input
              id="code"
              className={`${fieldClass} text-center font-mono text-lg tracking-[0.4em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <button
            type="submit"
            className={buttonClass}
            disabled={busy || code.length !== 6}
          >
            {busy ? "Opening…" : "Open secret"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-neutral-500 underline underline-offset-2"
            onClick={() => {
              setStage("email");
              setCode("");
              setError(null);
            }}
          >
            Use a different address
          </button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      <Title>Someone sent you a secret</Title>
      <Sub>
        It can be opened exactly once. Confirm your email to receive a one-time
        code.
      </Sub>
      <form onSubmit={requestCode} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Your email</Label>
          <input
            id="email"
            type="email"
            required
            className={fieldClass}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
      </form>
    </Card>
  );
}
