import { describe, expect, it } from "vitest"
import { requireScope, type MerchantKeyContext } from "./authenticate-merchant-key"

function ctx(scopes: string[]): MerchantKeyContext {
  return { businessId: "biz", mode: "test", keyId: "key", scopes }
}

describe("requireScope", () => {
  it("allows a listed scope", () => {
    expect(requireScope(ctx(["checkout"]), "checkout")).toEqual({ ok: true })
  })

  it("rejects a missing scope without granting others", () => {
    expect(requireScope(ctx(["checkout"]), "transfers.write")).toEqual({
      ok: false,
      status: 403,
      error: "This key cannot transfers.write",
    })
  })
})
