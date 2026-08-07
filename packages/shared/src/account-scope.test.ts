import { describe, expect, it } from "vitest"
import { readAccountScopeFromHeaders } from "./account-scope"

describe("readAccountScopeFromHeaders", () => {
  it("prefers the new account-scope header", () => {
    const headers = new Map([
      ["x-easner-account-scope", "business"],
      ["x-easner-noah-scope", "individual"],
    ])
    expect(readAccountScopeFromHeaders((name) => headers.get(name) ?? null)).toBe(
      "business",
    )
  })

  it("falls back to the legacy Noah-named header", () => {
    const headers = new Map([["x-easner-noah-scope", "business"]])
    expect(readAccountScopeFromHeaders((name) => headers.get(name) ?? null)).toBe(
      "business",
    )
  })
})
