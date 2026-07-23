"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  ErrorNote,
  Label,
  Sub,
  Title,
  buttonClass,
  fieldClass,
} from "../../ui";

export interface Share {
  share_id: string;
  grantee_email: string;
  permission: string;
  created_at: string;
}

export default function ShareManager({
  secretId,
  shares,
}: {
  secretId: string;
  shares: Share[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError("Enter a colleague's email.");
    setBusy(true);
    try {
      const res = await fetch(`/api/secrets/${secretId}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), permission }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not share.");
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    await fetch(`/api/secrets/${secretId}/shares/${shareId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  return (
    <Card>
      <Title>Sharing</Title>
      <Sub>Give another Inseed employee access. They must have signed in once.</Sub>

      {shares.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
          {shares.map((s) => (
            <li
              key={s.share_id}
              className="flex items-center justify-between py-2.5 text-sm"
            >
              <span className="min-w-0 truncate text-neutral-900 dark:text-neutral-100">
                {s.grantee_email}
              </span>
              <div className="flex items-center gap-3">
                <span className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                  {s.permission}
                </span>
                <button
                  onClick={() => revoke(s.share_id)}
                  className="text-xs text-red-600 underline underline-offset-2 hover:text-red-700 dark:text-red-400"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 space-y-3">
        <div>
          <Label htmlFor="grantee">Add someone</Label>
          <div className="flex gap-2">
            <input
              id="grantee"
              type="email"
              className={fieldClass}
              placeholder="colleague@inseed.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className={`${fieldClass} w-28`}
              value={permission}
              onChange={(e) => setPermission(e.target.value)}
              aria-label="Permission"
            >
              <option value="read">Read</option>
              <option value="edit">Edit</option>
            </select>
          </div>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Sharing…" : "Share"}
        </button>
      </form>
    </Card>
  );
}
