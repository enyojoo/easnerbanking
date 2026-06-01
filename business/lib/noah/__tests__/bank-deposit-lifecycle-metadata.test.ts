import { describe, expect, it } from "vitest"
import { mergeBankDepositLifecycleMetadata } from "../bank-onramp-tx"

describe("mergeBankDepositLifecycleMetadata", () => {
  it("on_chain_settled_at overwrites completed_at from fiat leg", () => {
    const merged = mergeBankDepositLifecycleMetadata(
      {
        completed_at: "2026-05-19T22:00:53Z",
        fiat_settled_at: "2026-05-19T22:00:52Z",
      },
      { on_chain_settled_at: "2026-05-19T22:01:42Z" },
    )
    expect(merged.on_chain_settled_at).toBe("2026-05-19T22:01:42Z")
    expect(merged.completed_at).toBe("2026-05-19T22:01:42Z")
    expect(merged.fiat_settled_at).toBe("2026-05-19T22:00:52Z")
  })
})
