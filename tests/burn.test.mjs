/**
 * Exercises the SQL that enforces the one-time-view guarantee against a real
 * Postgres (PGlite = Postgres compiled to WASM), so the burn is proven rather
 * than assumed.
 *
 *   node --test tests/
 */
import test, { before, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

/** Kept character-identical to src/app/api/secrets/[id]/reveal/route.ts */
const BURN = `
  update secrets s
  set viewed_at = now(), viewed_by = $2, destroyed_at = now(),
      ciphertext = '', iv = ''
  from secrets old
  where s.id = old.id
    and s.id = $1
    and s.viewed_at is null
    and s.expires_at > now()
  returning old.ciphertext as ciphertext, old.iv as iv, old.label as label
`;

let db;

before(async () => {
  db = new PGlite();
  await db.exec(schema);
});

async function makeSecret({ ciphertext = "CIPHER", ttl = "1 hour" } = {}) {
  const { rows } = await db.query(
    `insert into secrets (label, ciphertext, iv, allowed_emails, created_by, expires_at)
     values ('DB password', $1, 'IV', array['client@acme.com'], 'me@jumpapp.com',
             now() + $2::interval)
     returning id`,
    [ciphertext, ttl],
  );
  return rows[0].id;
}

describe("schema", () => {
  test("loads against real postgres", async () => {
    const { rows } = await db.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by 1`,
    );
    assert.deepEqual(
      rows.map((r) => r.table_name),
      ["audit_log", "otp_challenges", "secrets"],
    );
  });

  test("rejects a secret with no recipients", async () => {
    await assert.rejects(() =>
      db.query(
        `insert into secrets (ciphertext, iv, allowed_emails, created_by, expires_at)
         values ('c', 'i', array[]::text[], 'me@jumpapp.com', now() + interval '1 hour')`,
      ),
    );
  });
});

describe("burn", () => {
  test("returns the PRE-UPDATE ciphertext, not the scrubbed value", async () => {
    const id = await makeSecret({ ciphertext: "SECRET-BLOB" });
    const { rows } = await db.query(BURN, [id, "client@acme.com"]);

    assert.equal(rows.length, 1);
    // The whole design rests on this: RETURNING must hand back the old row.
    assert.equal(rows[0].ciphertext, "SECRET-BLOB");
    assert.equal(rows[0].iv, "IV");
    assert.equal(rows[0].label, "DB password");
  });

  test("scrubs the stored row in the same statement", async () => {
    const id = await makeSecret({ ciphertext: "GONE-SOON" });
    await db.query(BURN, [id, "client@acme.com"]);

    const { rows } = await db.query(
      `select ciphertext, iv, viewed_by, viewed_at is not null as burned,
              destroyed_at is not null as destroyed
       from secrets where id = $1`,
      [id],
    );
    assert.equal(rows[0].ciphertext, "");
    assert.equal(rows[0].iv, "");
    assert.equal(rows[0].burned, true);
    assert.equal(rows[0].destroyed, true);
    assert.equal(rows[0].viewed_by, "client@acme.com");
  });

  test("a second burn yields nothing — one view, ever", async () => {
    const id = await makeSecret();
    const first = await db.query(BURN, [id, "client@acme.com"]);
    const second = await db.query(BURN, [id, "someone@else.com"]);

    assert.equal(first.rows.length, 1);
    assert.equal(second.rows.length, 0);
  });

  test("does not overwrite the first viewer's identity", async () => {
    const id = await makeSecret();
    await db.query(BURN, [id, "client@acme.com"]);
    await db.query(BURN, [id, "attacker@evil.com"]);

    const { rows } = await db.query(`select viewed_by from secrets where id = $1`, [id]);
    assert.equal(rows[0].viewed_by, "client@acme.com");
  });

  test("an expired secret cannot be burned", async () => {
    const id = await makeSecret({ ttl: "-1 second" });
    const { rows } = await db.query(BURN, [id, "client@acme.com"]);
    assert.equal(rows.length, 0);
  });

  test("concurrent burns: exactly one wins", async () => {
    const id = await makeSecret({ ciphertext: "ONLY-ONCE" });
    // Fired without awaiting in between, so both are in flight at once.
    const results = await Promise.all([
      db.query(BURN, [id, "a@acme.com"]),
      db.query(BURN, [id, "b@acme.com"]),
      db.query(BURN, [id, "c@acme.com"]),
    ]);
    const winners = results.filter((r) => r.rows.length === 1);
    assert.equal(winners.length, 1);
    assert.equal(winners[0].rows[0].ciphertext, "ONLY-ONCE");
  });
});

describe("recipient allowlist", () => {
  test("matches a listed address and rejects an unlisted one", async () => {
    const id = await makeSecret();
    const lookup = (email) =>
      db.query(
        `select id from secrets
         where id = $1 and viewed_at is null and expires_at > now()
           and $2 = any (allowed_emails)`,
        [id, email],
      );

    assert.equal((await lookup("client@acme.com")).rows.length, 1);
    assert.equal((await lookup("attacker@evil.com")).rows.length, 0);
  });
});

describe("otp attempts", () => {
  const CLAIM = `
    update otp_challenges
    set attempts = attempts + 1
    where id = (
      select id from otp_challenges
      where secret_id = $1 and email = $2
        and consumed_at is null and expires_at > now()
      order by created_at desc
      limit 1
    )
    and attempts < 5
    returning id, code_hash
  `;

  async function challenge(id, { ttl = "10 minutes", hash = "HASH" } = {}) {
    await db.query(
      `insert into otp_challenges (secret_id, email, code_hash, expires_at)
       values ($1, 'client@acme.com', $2, now() + $3::interval)`,
      [id, hash, ttl],
    );
  }

  test("stops handing out the challenge after 5 attempts", async () => {
    const id = await makeSecret();
    await challenge(id);

    for (let i = 1; i <= 5; i++) {
      const { rows } = await db.query(CLAIM, [id, "client@acme.com"]);
      assert.equal(rows.length, 1, `attempt ${i} should be allowed`);
    }
    const { rows } = await db.query(CLAIM, [id, "client@acme.com"]);
    assert.equal(rows.length, 0, "6th attempt must be refused");
  });

  test("an expired code is never claimable", async () => {
    const id = await makeSecret();
    await challenge(id, { ttl: "-1 second" });
    const { rows } = await db.query(CLAIM, [id, "client@acme.com"]);
    assert.equal(rows.length, 0);
  });

  test("a resent code supersedes the previous one", async () => {
    const id = await makeSecret();
    await challenge(id, { hash: "OLD" });
    // What the challenge route does before inserting the replacement.
    await db.query(
      `update otp_challenges set consumed_at = now()
       where secret_id = $1 and email = 'client@acme.com' and consumed_at is null`,
      [id],
    );
    await challenge(id, { hash: "NEW" });

    const { rows } = await db.query(CLAIM, [id, "client@acme.com"]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code_hash, "NEW", "the old code must be dead");
  });

  test("audit rows survive the secret they describe", async () => {
    const id = await makeSecret();
    await db.query(
      `insert into audit_log (secret_id, event, actor) values ($1, 'revealed', 'client@acme.com')`,
      [id],
    );
    await db.query(`delete from secrets where id = $1`, [id]);

    const { rows } = await db.query(`select event from audit_log where secret_id = $1`, [id]);
    assert.equal(rows.length, 1, "audit trail must outlive the secret");
  });
});
