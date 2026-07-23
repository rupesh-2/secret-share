# Secret Share

Send a password or API key over a link that can be opened **exactly once**, by
**exactly one person**, and that the server itself cannot read.

Built for sharing credentials with clients and inside the team, without leaving
them sitting in Slack history or an inbox forever.

## How it works

```
Creator (Google SSO, company domain)
  │  browser generates an AES-256-GCM key, encrypts the secret
  │  POST /api/secrets  →  ciphertext + iv + allowed emails      (key stays local)
  ▼
Link:  https://host/s/<uuid>#<key>
                          └─────┴── fragment: never sent to the server
  │
  ▼
Recipient opens link
  │  POST /api/secrets/:id/challenge  { email }   → 6-digit code emailed
  │  POST /api/secrets/:id/reveal     { email, code }
  │     └── atomically burns the row and returns the ciphertext once
  ▼
  browser decrypts using the key from the fragment
```

### The four guarantees

| Requirement | How it's enforced |
|---|---|
| One-time view | A single conditional `UPDATE ... WHERE viewed_at IS NULL` scrubs the ciphertext and returns its pre-image in the same statement. Concurrent readers cannot both win. |
| Public on the internet | No VPN or IP allowlist. Reachability is not the security boundary. |
| Only certain users | The link alone is useless: revealing requires an emailed code proving control of an address the creator listed. |
| Only certain creators | Google SSO restricted to `ALLOWED_EMAIL_DOMAINS`. Unset ⇒ nobody can sign in (fails closed). |

**Zero-knowledge.** The key lives after the `#`, which browsers never transmit.
The server stores ciphertext only — a database dump, a backup, or a subpoena
yields nothing readable without the links themselves.

## Setup

```bash
npm install
cp .env.example .env.local     # then fill it in — see notes in the file
psql "$DATABASE_URL" -f db/schema.sql
npm run dev
```

You need a Postgres URL, a Google OAuth client, `npx auth secret` for
`AUTH_SECRET`, and a random `OTP_PEPPER`. Leave `RESEND_API_KEY` empty in dev and
codes print to the server console instead of being emailed.

## Design notes

**Email enumeration.** `/challenge` always returns the same `200 {ok:true}`,
whether the id is bogus, already burned, or the address isn't on the list.
Otherwise it would confirm who a secret was addressed to.

**Link prefetching.** Slack, Outlook, and antivirus scanners follow links in
messages. Nothing burns on `GET` — revealing needs a `POST` plus a code — so a
scanner cannot silently consume the secret. This is a real advantage over
click-to-burn designs.

**OTP hardening.** Codes are 6 digits, so they're hashed with a server-side
pepper (a bare hash of a 10^6 keyspace falls instantly to an offline sweep).
Attempts are capped at 5 and incremented in the same statement that selects the
challenge, so parallel guesses burn the budget instead of racing it. Requesting
a new code supersedes the old one.

**Audit trail.** `audit_log` records create / send / reveal / bad-code events
and deliberately has no foreign key, so it outlives the secret it describes. It
never contains the secret or the key.

**Expiry.** Rows past `expires_at` stop revealing immediately. Schedule a purge
to drop the ciphertext too:

```sql
update secrets set ciphertext = '', iv = '', destroyed_at = now()
where expires_at < now() and destroyed_at is null;
delete from otp_challenges where expires_at < now() - interval '1 day';
```

## Tests

```bash
npm test
```

The SQL behind the one-time guarantee runs against real Postgres (PGlite —
Postgres compiled to WASM), no database server required. `tests/burn.test.mjs`
holds the burn statement character-identical to the one in the reveal route and
asserts that it returns the pre-update ciphertext, scrubs the stored row, yields
nothing on a second call, refuses expired rows, keeps the first viewer's
identity, caps OTP attempts at 5, kills superseded codes, and preserves the
audit trail after the secret is deleted.

**If you edit the burn statement in the route, edit it in the test too** — they
are duplicated on purpose so the test pins the exact SQL that ships.

## Verified / not yet verified

- **Verified:** the burn returns the *pre-update* ciphertext while scrubbing the
  row in one statement; second/expired burns yield nothing; OTP attempt cap and
  supersede logic; recipient allowlist matching; audit rows outlive secrets.
  Crypto: round-trip, 256-bit keys, unique key+IV per secret, wrong-key and
  tampered-ciphertext both reject. `next build`, `tsc --noEmit`, `eslint` clean.
- **Caveat on concurrency:** PGlite serializes queries in one connection, so the
  "exactly one winner" test proves *sequential* exclusion. True parallel safety
  rests on Postgres row locking during `UPDATE`, which is sound but is not
  exercised here. Worth one race test against a real server if you want it airtight.
- **Not yet exercised:** the HTTP routes end to end and the Google sign-in flow —
  they need a live `DATABASE_URL` and OAuth credentials. Walk one secret through
  before trusting it in production.
