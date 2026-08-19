import { describe, expect, it } from "vitest"
import { publicRobotsForHostname } from "./public-robots"

describe("publicRobotsForHostname", () => {
  it("allows crawlers on pay and invoice hosts so share cards can unfurl", () => {
    expect(publicRobotsForHostname("pay.easner.com")).toEqual({
      rules: { userAgent: "*", allow: "/" },
    })
    expect(publicRobotsForHostname("invoice.easner.com")).toEqual({
      rules: { userAgent: "*", allow: "/" },
    })
  })

  it("keeps the operator dashboard closed", () => {
    expect(publicRobotsForHostname("business.easner.com")).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    })
    expect(publicRobotsForHostname(null)).toEqual({
      rules: { userAgent: "*", disallow: "/" },
    })
  })
})
