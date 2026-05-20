import { describe, expect, it } from "vitest"
import {
  pickNoahOnChainTxHashFromLedgerRow,
  pickNoahOnChainTxHashFromPayload,
} from "@/lib/noah/noah-on-chain-tx-hash"

describe("pickNoahOnChainTxHashFromPayload", () => {
  it("reads PublicID when TxHash is absent", () => {
    expect(
      pickNoahOnChainTxHashFromPayload({
        PublicID: "5mCrW99zYgdkykeHc6ohKfJby1gb4qbKuNdcaspKJyv732MKBkGNzdkyApoEW5HWvzge19TqBhENntSCaQLYw59m",
      }),
    ).toBe("5mCrW99zYgdkykeHc6ohKfJby1gb4qbKuNdcaspKJyv732MKBkGNzdkyApoEW5HWvzge19TqBhENntSCaQLYw59m")
  })
})

describe("pickNoahOnChainTxHashFromLedgerRow", () => {
  it("falls back to payload when tx_hash column is null", () => {
    expect(
      pickNoahOnChainTxHashFromLedgerRow({
        tx_hash: null,
        payload: { PublicID: "abc-sig" },
        metadata: {},
      }),
    ).toBe("abc-sig")
  })
})
