import { describe, expect, it } from "vitest"
import { emailAnchorOpenTag, shouldSkipSesClickTracking } from "./email-anchor"

describe("emailAnchorOpenTag", () => {
  it("marks app.easner.com hrefs so SES will not wrap them for click tracking", () => {
    expect(shouldSkipSesClickTracking("https://app.easner.com/user/transactions/ETID1")).toBe(true)
    expect(
      emailAnchorOpenTag("https://app.easner.com/user/transactions/ETID1", 'class="cta-button"'),
    ).toBe('<a ses:no-track href="https://app.easner.com/user/transactions/ETID1" class="cta-button">')
  })

  it("leaves marketing and support hosts trackable", () => {
    expect(shouldSkipSesClickTracking("https://www.easner.com/contact")).toBe(false)
    expect(emailAnchorOpenTag("https://www.easner.com/contact")).toBe(
      '<a href="https://www.easner.com/contact">',
    )
  })
})
