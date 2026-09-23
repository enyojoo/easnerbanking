import { describe, expect, it } from "vitest"
import {
  extractTxHashFromTurnkeySendStatusResponse,
  interpretTurnkeyGetSendTransactionStatus,
  pollUntilTurnkeySendTerminal,
} from "@/lib/turnkey/sol-send-polling"

describe("extractTxHashFromTurnkeySendStatusResponse", () => {
  it("reads Solana signature from solana.signature", () => {
    expect(
      extractTxHashFromTurnkeySendStatusResponse({
        txStatus: "INCLUDED",
        solana: { signature: "5xYzabc" },
      }),
    ).toBe("5xYzabc")
  })

  it("falls back to eth.txHash", () => {
    expect(
      extractTxHashFromTurnkeySendStatusResponse({
        txStatus: "COMPLETED",
        eth: { txHash: "0xdead" },
      }),
    ).toBe("0xdead")
  })
})

describe("interpretTurnkeyGetSendTransactionStatus", () => {
  it("maps COMPLETED with nested Solana signature to settled", () => {
    expect(
      interpretTurnkeyGetSendTransactionStatus({
        txStatus: "COMPLETED",
        solana: { signature: "sig1" },
      }),
    ).toEqual({ status: "settled", txHash: "sig1" })
  })

  it("maps FAILED to failed", () => {
    expect(
      interpretTurnkeyGetSendTransactionStatus({
        txStatus: "FAILED",
        txError: "simulation failed",
      }),
    ).toEqual({ status: "failed", txHash: null })
  })

  it("maps CANCELLED to failed", () => {
    expect(interpretTurnkeyGetSendTransactionStatus({ txStatus: "CANCELLED" })).toEqual({
      status: "failed",
      txHash: null,
    })
  })

  it("treats signature without txStatus as settled (early snapshot)", () => {
    expect(
      interpretTurnkeyGetSendTransactionStatus({
        solana: { signature: "sigOnly" },
      }),
    ).toEqual({ status: "settled", txHash: "sigOnly" })
  })

  it("unwraps nested result shape from some gateways", () => {
    expect(
      interpretTurnkeyGetSendTransactionStatus({
        result: { txStatus: "COMPLETED", solana: { signature: "sigNested" } },
      }),
    ).toEqual({ status: "settled", txHash: "sigNested" })
  })

  it("keeps pending when txStatus is explicit PENDING even if signature is present", () => {
    expect(
      interpretTurnkeyGetSendTransactionStatus({
        txStatus: "PENDING",
        solana: { signature: "sigEarly" },
      }),
    ).toEqual({ status: "pending", txHash: "sigEarly" })
  })
})

describe("pollUntilTurnkeySendTerminal", () => {
  it("returns as soon as a signature is present when returnOnSignature is set", async () => {
    let calls = 0
    const client = {
      getSendTransactionStatus: async () => {
        calls += 1
        return { txStatus: "PENDING", solana: { signature: "feeSig" } }
      },
    }
    const last = await pollUntilTurnkeySendTerminal(client, "org", "sha256:fee", {
      timeoutMs: 5_000,
      intervalMs: 1_000,
      returnOnSignature: true,
    })
    expect(calls).toBe(1)
    expect(interpretTurnkeyGetSendTransactionStatus(last).txHash).toBe("feeSig")
  })
})
