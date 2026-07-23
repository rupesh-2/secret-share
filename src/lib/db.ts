import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  var __sql: Sql | undefined;
}

let client: Sql | undefined;

function db(): Sql {
  // globalThis survives dev hot reloads (module state does not), so the pool
  // is reused instead of leaking a new one per edit.
  client ??= globalThis.__sql;
  if (client) return client;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  client = postgres(url, {
    ssl: url.includes("sslmode=require") ? "require" : undefined,
    max: 10,
  });
  if (process.env.NODE_ENV !== "production") globalThis.__sql = client;
  return client;
}

/**
 * Connects on first query, not on import: `next build` imports every route
 * module to collect metadata and must not need a reachable database to do so.
 */
export const sql: Sql = new Proxy((() => {}) as unknown as Sql, {
  get: (_t, prop, recv) => Reflect.get(db(), prop, recv),
  apply: (_t, thisArg, args) => Reflect.apply(db(), thisArg, args),
});
