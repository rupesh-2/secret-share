"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generatePassword } from "@/lib/crypto/generator";
import {
  Card,
  ErrorNote,
  Label,
  Sub,
  Title,
  buttonClass,
  fieldClass,
} from "../ui";

const TYPES = [
  { v: "password", t: "Password" },
  { v: "api_key", t: "API key" },
  { v: "ssh_key", t: "SSH key" },
  { v: "token", t: "Token" },
  { v: "note", t: "Note" },
  { v: "env", t: "Env vars" },
  { v: "db_cred", t: "DB credentials" },
];

export default function NewForm() {
  const router = useRouter();
  const [type, setType] = useState("password");
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Give the secret a title.");
    if (!value.trim()) return setError("Enter the secret value.");

    setBusy(true);
    try {
      const res = await fetch("/api/secrets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          username: username || null,
          url: url || null,
          description: description || null,
          value,
        }),
      });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Could not save.");
      }
      const { id } = await res.json();
      setValue("");
      router.push(`/vault/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const multiline = type === "note" || type === "env" || type === "ssh_key";

  return (
    <Card>
      <div className="flex items-center justify-between">
        <Title>New secret</Title>
        <Link href="/" className="text-xs text-neutral-500 underline underline-offset-2">
          Cancel
        </Link>
      </div>
      <Sub>Encrypted before it reaches the server. Only you and people you share it with can open it.</Sub>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            className={fieldClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPES.map((o) => (
              <option key={o.v} value={o.v}>
                {o.t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="title">Title</Label>
          <input
            id="title"
            className={fieldClass}
            placeholder="Staging database"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="username">Username</Label>
            <input
              id="username"
              className={fieldClass}
              placeholder="optional"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="url">URL</Label>
            <input
              id="url"
              className={fieldClass}
              placeholder="optional"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="value">Secret</Label>
            {!multiline && (
              <button
                type="button"
                onClick={() =>
                  setValue(
                    generatePassword({
                      length: 20,
                      upper: true,
                      lower: true,
                      number: true,
                      symbol: true,
                    }),
                  )
                }
                className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                Generate
              </button>
            )}
          </div>
          {multiline ? (
            <textarea
              id="value"
              className={`${fieldClass} h-28 resize-y font-mono`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : (
            <input
              id="value"
              className={`${fieldClass} font-mono`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <input
            id="description"
            className={fieldClass}
            placeholder="optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button type="submit" className={buttonClass} disabled={busy}>
          {busy ? "Saving…" : "Save to vault"}
        </button>
      </form>
    </Card>
  );
}
