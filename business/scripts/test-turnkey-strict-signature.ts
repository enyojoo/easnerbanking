/**
 * Local check for Turnkey Webhooks V2 strict Ed25519 verification.
 *
 * Usage:
 *   cd business
 *   TURNKEY_WEBHOOK_STRICT_SIGNATURE=true \
 *   TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY=<hex> \
 *   npx tsx scripts/test-turnkey-strict-signature.ts
 *
 * Optional capture from a real delivery (raw body must be exact bytes Turnkey signed):
 *   ... npx tsx scripts/test-turnkey-strict-signature.ts --body-file ./capture.json \
 *       --event-id <id> --timestamp <ms> --signature <128-char-hex>
 */

import { readFileSync } from "node:fs"
import { generateKeyPairSync, sign } from "node:crypto"
import { buildTurnkeyWebhookV1SignedMessage } from "../lib/turnkey/turnkey-webhook-signed-payload"
import { verifyTurnkeyWebhookSignature } from "../lib/turnkey/webhook-verify"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function runRoundTrip(): boolean {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer
  process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY = spki.subarray(12).toString("hex")
  process.env.TURNKEY_WEBHOOK_STRICT_SIGNATURE = "true"

  const rawBody = Buffer.from('{"type":"balances:confirmed","msg":{"operation":"deposit"}}', "utf8")
  const eventId = "strict-roundtrip-event"
  const timestamp = "1779468508161"
  const message = buildTurnkeyWebhookV1SignedMessage({
    rawBody,
    eventId,
    timestampForSigning: timestamp,
    signingKeyId: "turnkey_webhook_signing_key_001",
    signatureVersion: "v1",
    algorithm: "ed25519",
  })
  if (!message) {
    console.error("FAIL: could not build canonical signed message")
    return false
  }

  const signatureHeader = sign(null, message, privateKey).toString("hex")
  const ok = verifyTurnkeyWebhookSignature({
    rawBody,
    signatureHeader,
    meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
    eventId,
    timestamp,
  })
  console.log(ok ? "PASS: strict verify round-trip (ephemeral key)" : "FAIL: strict verify round-trip")
  return ok
}

function runCapturedDelivery(): boolean | null {
  const bodyFile = arg("--body-file")
  const eventId = arg("--event-id")
  const timestamp = arg("--timestamp")
  const signature = arg("--signature")
  if (!bodyFile && !eventId && !timestamp && !signature) return null

  if (!bodyFile || !eventId || !timestamp || !signature) {
    console.error("Capture mode requires --body-file --event-id --timestamp --signature")
    process.exit(1)
  }

  const pub = process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY?.trim()
  if (!pub) {
    console.error("Set TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY to Turnkey platform key hex")
    process.exit(1)
  }

  process.env.TURNKEY_WEBHOOK_STRICT_SIGNATURE = "true"
  const rawBody = readFileSync(bodyFile)
  const ok = verifyTurnkeyWebhookSignature({
    rawBody,
    signatureHeader: signature,
    meta: { algorithm: "ed25519", keyId: "turnkey_webhook_signing_key_001", version: "v1" },
    eventId,
    timestamp,
  })
  const prefix = buildTurnkeyWebhookV1SignedMessage({
    rawBody,
    eventId,
    timestampForSigning: timestamp,
    signingKeyId: "turnkey_webhook_signing_key_001",
    signatureVersion: "v1",
    algorithm: "ed25519",
  })
  console.log("canonical_prefix_preview:", prefix?.toString("utf8").slice(0, 120) + "…")
  console.log("raw_body_bytes:", rawBody.length)
  console.log(ok ? "PASS: strict verify captured delivery" : "FAIL: strict verify captured delivery")
  return ok
}

function main() {
  const captured = runCapturedDelivery()
  const roundTrip = runRoundTrip()

  if (captured === false) {
    console.log("\nNext: ask Turnkey for one failing delivery with raw body bytes + X-Turnkey-Signature hex.")
    process.exit(1)
  }
  if (captured === true) {
    console.log("\nStrict verify works for the captured delivery. Safe to keep TURNKEY_WEBHOOK_STRICT_SIGNATURE=true in production.")
    process.exit(0)
  }

  if (!roundTrip) process.exit(1)

  const pub = process.env.TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY?.trim()
  if (pub && pub.length === 64) {
    console.log("\nTurnkey platform key is configured. Strict mode is NOT yet proven against live Turnkey signatures")
    console.log("until you run capture mode with a real webhook body file + signature from logs.")
    console.log("\nTo test after the next webhook: save raw POST body to a file (exact bytes), then:")
    console.log(
      "  TURNKEY_WEBHOOK_STRICT_SIGNATURE=true TURNKEY_WEBHOOK_SIGNING_PUBLIC_KEY=... \\",
    )
    console.log(
      "  npx tsx scripts/test-turnkey-strict-signature.ts --body-file ./turnkey-capture.json \\",
    )
    console.log("    --event-id <X-Turnkey-Event-Id> --timestamp <X-Turnkey-Timestamp> --signature <hex>")
  }
}

main()
