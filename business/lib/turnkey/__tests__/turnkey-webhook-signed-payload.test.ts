import { describe, expect, it } from "vitest"
import {
  buildTurnkeyWebhookV1SignedMessage,
  buildTurnkeyWebhookV1SignedMessageCandidates,
} from "@/lib/turnkey/turnkey-webhook-signed-payload"

describe("buildTurnkeyWebhookV1SignedMessage", () => {
  it("matches Turnkey v1.ed25519 canonical prefix + raw body", () => {
    const body = Buffer.from('{"a":1}', "utf8")
    const tsMs = String(Date.parse("2026-05-20T19:15:56.000Z"))
    const message = buildTurnkeyWebhookV1SignedMessage({
      rawBody: body,
      eventId: "evt-1",
      timestampMs: tsMs,
      signingKeyId: "turnkey_webhook_signing_key_001",
    })
    expect(message?.toString("utf8")).toBe(
      `v1.ed25519.turnkey_webhook_signing_key_001.${tsMs}.evt-1.{"a":1}`,
    )
  })

  it("accepts millisecond timestamp header as-is", () => {
    const body = Buffer.from("x", "utf8")
    const message = buildTurnkeyWebhookV1SignedMessage({
      rawBody: body,
      eventId: "e1",
      timestampMs: "1747772156000",
    })
    expect(message?.toString("utf8")).toBe(
      "v1.ed25519.turnkey_webhook_signing_key_001.1747772156000.e1.x",
    )
  })

  it("builds compatibility candidates for Turnkey preview header variants", () => {
    const body = Buffer.from("x", "utf8")
    const candidates = buildTurnkeyWebhookV1SignedMessageCandidates({
      rawBody: body,
      eventId: "e1",
      timestampMs: "1747772156000",
    })
    expect(candidates.map((c) => c.name)).toEqual([
      "turnkey-v1-full-prefix",
      "turnkey-v1-no-key",
      "svix-style",
      "timestamp-event",
      "turnkey-key-timestamp-event",
      "raw-body",
    ])
    expect(candidates.map((c) => c.message.toString("utf8"))).toContain(
      "v1.ed25519.1747772156000.e1.x",
    )
  })
})
