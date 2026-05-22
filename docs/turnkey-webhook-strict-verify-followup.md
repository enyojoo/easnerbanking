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

**Example from our logs (strict verify failed):**

- `X-Turnkey-Signature-Key-Id`: `turnkey_webhook_signing_key_001`
- `X-Turnkey-Signature-Algorithm`: `ed25519`
- `X-Turnkey-Signature-Version`: `v1`
- `X-Turnkey-Event-Id`: `d0615573e020ae26f1470fba250da566da75a76bc12f922489166fd518826770`
- `X-Turnkey-Timestamp`: `1779468508633`
- Public key fingerprint (sha256 prefix): `48b1d94ddaaa602d` (matches key you provided)
- Raw body length: **741** bytes
- Raw body sha256 (first 16 hex): `254966dfd59c161d`

Can you provide **one** of the following so we can close strict verify?

1. A sample **raw request body** (exact bytes or hex) + matching `X-Turnkey-Signature` hex for a test event, or  
2. Confirmation whether Vercel (or any proxy in front of our Next.js route) might alter the body (whitespace, key order, decompression), or  
3. A Node.js snippet from your side that verifies a real production signature against the raw body.

Our verifier snippet:

```ts
import { verify as cryptoVerify, createPublicKey } from "node:crypto"

function verifyTurnkeyV2Webhook(params: {
  rawBody: Buffer
  signatureHex: string
  version: string       // X-Turnkey-Signature-Version
  algorithm: string     // X-Turnkey-Signature-Algorithm
  keyId: string         // X-Turnkey-Signature-Key-Id
  timestamp: string     // X-Turnkey-Timestamp (exact header value)
  eventId: string       // X-Turnkey-Event-Id
  publicKeyHex32: string
}): boolean {
  const prefix = `${params.version}.${params.algorithm}.${params.keyId}.${params.timestamp}.${params.eventId}.`
  const message = Buffer.concat([Buffer.from(prefix, "utf8"), params.rawBody])
  const sig = Buffer.from(params.signatureHex.replace(/^0x/i, ""), "hex")
  const derPrefix = Buffer.from("302a300506032b6570032100", "hex")
  const publicKey = createPublicKey({
    key: Buffer.concat([derPrefix, Buffer.from(params.publicKeyHex32, "hex")]),
    format: "der",
    type: "spki",
  })
  return cryptoVerify(null, message, publicKey, sig)
}
```

We are also ready for the upcoming payload change (`organizationId` / `parentOrganizationId` at top level).

Thanks!
