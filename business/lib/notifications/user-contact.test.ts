import { describe, expect, it } from "vitest"
import { firstNameFromFullName } from "./user-contact"

describe("firstNameFromFullName", () => {
  it("returns the first token", () => {
    expect(firstNameFromFullName("Samuel Enyojo Odiba")).toBe("Samuel")
  })

  it("handles empty and whitespace", () => {
    expect(firstNameFromFullName(null)).toBeUndefined()
    expect(firstNameFromFullName("")).toBeUndefined()
    expect(firstNameFromFullName("   ")).toBeUndefined()
  })
})
