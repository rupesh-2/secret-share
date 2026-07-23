"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SignOutButton from "./sign-out-button";
import { Card, ErrorNote, Sub, Title, fieldClass } from "./ui";

export interface SecretRow {
  id: string;
  title: string;
  type: string;
  username: string | null;
  url: string | null;
  updated_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  password: "Password",
  api_key: "API key",
  ssh_key: "SSH key",
  token: "Token",
  note: "Note",
  env: "Env vars",
  db_cred: "DB creds",
};

function Badge({ type }: { type: string }) {
  return (
    <span className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

export default function Dashboard({
  email,
  secrets,
  dbReady,
}: {
  email: string;
  secrets: SecretRow[];
  dbReady: boolean;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return secrets;
    return secrets.filter((s) =>
      [s.title, s.username, s.url].some((v) => v?.toLowerCase().includes(t)),
    );
  }, [q, secrets]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Title>Vault</Title>
          <Sub>Secrets you own or that are shared with you.</Sub>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          New secret
        </Link>
      </div>

      {!dbReady && (
        <ErrorNote>
          Vault database is not initialized yet — apply the migration
          (supabase/migrations/0001_init.sql), then reload.
        </ErrorNote>
      )}

      <Card>
        <input
          className={fieldClass}
          placeholder="Search by title, username, or URL…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search secrets"
        />

        <div className="mt-4">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              {secrets.length === 0
                ? "No secrets yet. Create your first one."
                : "No matches."}
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/vault/${s.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                          {s.title}
                        </span>
                        <Badge type={s.type} />
                      </div>
                      {(s.username || s.url) && (
                        <p className="truncate text-xs text-neutral-500">
                          {[s.username, s.url].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="text-neutral-300 dark:text-neutral-600">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <p className="text-center text-xs text-neutral-500">
        Signed in as {email} · <SignOutButton />
      </p>
    </div>
  );
}
