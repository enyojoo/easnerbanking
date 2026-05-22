# Turnkey Webhooks V2 — strict signature follow-up (draft)

Use this if `TURNKEY_WEBHOOK_STRICT_SIGNATURE=true` still rejects live deliveries after we deploy the latest verifier.

---

@Hamilton @Yev

Thanks for confirming the signed message format:

`v1.ed25519.<signing_key_id>.<X-Turnkey-Timestamp>.<X-Turnkey-Event-Id>.<raw_body>`

We updated our verifier to:

- Read the body once with `request.arrayBuffer()` (no `request.json()` before verify)
- Use the **exact** `X-Turnkey-Timestamp` header string in the prefix (not re-parsed to ms)
- Use raw header values for `v1` / `ed25519` / key id
- Decode `X-Turnkey-Signature` as 128-char hex Ed25519

With `TURNKEY_WEBHOOK_STRICT_SIGNATURE=true`, we only accept the canonical prefix above (no compatibility fallbacks).

**Current result:** strict verify still fails on live `BALANCE_CONFIRMED_UPDATES` deliveries, while the same requests succeed when we allow compatibility mode (headers + org + timestamp checks only). `event_inbox` processes correctly in compatibility mode.

**Latest example from our logs (strict verify failed, `@noble/curves` canonical path):**

- `X-Turnkey-Signature-Key-Id`: `turnkey_webhook_signing_key_001`
- `X-Turnkey-Signature-Algorithm`: `ed25519`
- `X-Turnkey-Signature-Version`: `v1`
- `X-Turnkey-Event-Id`: `bbadb4135019fa7a367ae7c1cee3173f87b5589932870a7cb8b38ccf4a4a166d`
- `X-Turnkey-Timestamp`: `1779476726902`
- Public key fingerprint (sha256 prefix): `48b1d94ddaaa602d` (matches key you provided)
- Raw body length: **741** bytes
- Raw body sha256 (full): `acc5641ee92bfef3…` (see Vercel log field `rawBodySha256` after next deploy)
- Canonical prefix we verify: `v1.ed25519.turnkey_webhook_signing_key_001.1779476726902.bbadb4135019fa7a367ae7c1cee3173f87b5589932870a7cb8b38ccf4a4a166d.` + raw body bytes

Can you provide **one** of the following so we can close strict verify?

1. A sample **raw request body** (exact bytes or hex) + matching `X-Turnkey-Signature` hex for a test event, or  
2. Confirmation whether Vercel (or any proxy in front of our Next.js route) might alter the body (whitespace, key order, decompression), or  
3. A Node.js snippet from your side that verifies a real production signature against the raw body.

We now verify with your `@noble/curves/ed25519` snippet (same prefix + raw body) in `business/lib/turnkey/turnkey-webhook-ed25519-verify.ts`.

We are also ready for the upcoming payload change (`organizationId` / `parentOrganizationId` at top level).

Thanks!
