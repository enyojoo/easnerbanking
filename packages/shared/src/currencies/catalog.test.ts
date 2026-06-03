import { describe, expect, it } from "vitest"
import { getCurrencyCatalog } from "./catalog"

describe("getCurrencyCatalog", () => {
  it("uses R₣ for RWF instead of Intl narrow RF", () => {
    const entry = getCurrencyCatalog().find((c) => c.code === "RWF")
    expect(entry?.symbol).toBe("R₣")
  })
})
