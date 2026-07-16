import { describe, expect, it } from "vitest"
import {
  customerGreetingParagraphHtml,
  formatCustomerGreetingPlain,
  formatEasnerUserGreetingHtml,
  formatEasnerUserGreetingPlain,
} from "./email-greeting"

describe("email-greeting", () => {
  it("uses Hey with first name for Easner users", () => {
    expect(formatEasnerUserGreetingPlain("Sam")).toBe("Hey Sam,")
    expect(formatEasnerUserGreetingHtml("Sam")).toBe("Hey Sam,")
  })

  it("falls back to Hey there when name is missing", () => {
    expect(formatEasnerUserGreetingPlain()).toBe("Hey there,")
    expect(formatEasnerUserGreetingPlain("  ")).toBe("Hey there,")
  })

  it("escapes html in Easner user names", () => {
    expect(formatEasnerUserGreetingHtml("<script>")).toBe("Hey &lt;script&gt;,")
  })

  it("keeps Dear for external invoice customers", () => {
    expect(formatCustomerGreetingPlain("Jane Doe")).toBe("Dear Jane Doe,")
    expect(customerGreetingParagraphHtml("Jane Doe")).toContain("Dear Jane Doe,")
  })
})
