import { describe, expect, it } from "vitest"
import {
  extractTxHashFromTurnkeySendStatusResponse,
  interpretTurnkeyGetSendTransactionStatus,
} from "@/lib/turnkey/send"

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

  it("treats signature without explicit terminal status as settled", () => {
    expect(
      interpretTurnkeyGetSendTransactionStatus({
        solana: { signature: "sigOnly" },
      }),
    ).toEqual({ status: "settled", txHash: "sigOnly" })
  })
})
