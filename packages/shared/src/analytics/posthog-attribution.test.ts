import { describe, expect, it } from "vitest"
import {
  buildEasnerBusinessMarketingUrl,
  isFreshAuthUser,
  pageviewProperties,
  pathnameAfterAuthCallback,
  pathnameWithAttributionParams,
  personPropertiesFromUser,
  referringDomain,
  shouldIdentifyCrossDomainId,
  stripAttributionParamsFromUrl,
} from "./posthog-attribution"
import { amountBucket, corridor } from "./properties"

describe("referringDomain", () => {
  it("uses $direct when referrer is missing", () => {
    expect(referringDomain("")).toBe("$direct")
  })

  it("returns the hostname for a valid referrer", () => {
    expect(referringDomain("https://easner.com/pricing?utm_source=blog")).toBe("easner.com")
  })

  it("uses $direct for an unparseable referrer", () => {
    expect(referringDomain("not a url")).toBe("$direct")
  })
})

describe("pageviewProperties", () => {
  it("captures url, referrer, and referring domain", () => {
    expect(
      pageviewProperties(
        "https://business.easner.com/auth/signup?utm_source=google",
        "https://www.google.com/search?q=easner",
      ),
    ).toEqual({
      $current_url: "https://business.easner.com/auth/signup?utm_source=google",
      $referrer: "https://www.google.com/search?q=easner",
      $referring_domain: "www.google.com",
    })
  })

  it("marks missing referrer as $direct", () => {
    expect(pageviewProperties("https://business.easner.com/auth/login", "")).toEqual({
      $current_url: "https://business.easner.com/auth/login",
      $referrer: "$direct",
      $referring_domain: "$direct",
    })
  })
})

describe("pathnameAfterAuthCallback", () => {
  it("drops auth codes and tracking params while keeping app params like next", () => {
    const url = new URL(
      "https://business.easner.com/dashboard?code=abc&utm_source=email&utm_campaign=launch&__ph_id=ph_123&gclid=g1&next=/send",
    )
    expect(pathnameAfterAuthCallback(url)).toBe("/dashboard?next=%2Fsend")
  })

  it("returns a bare path when only auth params were present", () => {
    const url = new URL("https://business.easner.com/auth/callback?code=abc")
    expect(pathnameAfterAuthCallback(url)).toBe("/auth/callback")
  })
})

describe("stripAttributionParamsFromUrl", () => {
  it("removes UTMs and __ph_id but keeps functional query params", () => {
    const url = new URL(
      "https://business.easner.com/auth/signup?utm_source=easner_website&__ph_id=ph_123&next=/dashboard",
    )
    expect(stripAttributionParamsFromUrl(url)).toBe("/auth/signup?next=%2Fdashboard")
  })
})

describe("buildEasnerBusinessMarketingUrl", () => {
  it("adds product referral UTMs and optional cross-domain id", () => {
    const href = buildEasnerBusinessMarketingUrl({
      campaign: "payer_invoice",
      distinctId: "019fa095-db6a-739d-8700-93ca24411e19",
    })
    const url = new URL(href)
    expect(url.origin + url.pathname).toBe("https://www.easner.com/business")
    expect(url.searchParams.get("utm_source")).toBe("easner_product")
    expect(url.searchParams.get("utm_medium")).toBe("referral")
    expect(url.searchParams.get("utm_campaign")).toBe("payer_invoice")
    expect(url.searchParams.get("__ph_id")).toBe("019fa095-db6a-739d-8700-93ca24411e19")
  })
})

describe("pathnameWithAttributionParams", () => {
  it("matches pathnameAfterAuthCallback for backward compatibility", () => {
    const url = new URL(
      "https://business.easner.com/dashboard?code=abc&utm_source=email&__ph_id=ph_123",
    )
    expect(pathnameWithAttributionParams(url)).toBe(pathnameAfterAuthCallback(url))
  })
})

describe("shouldIdentifyCrossDomainId", () => {
  it("identifies anonymous visitors with a cross-domain id", () => {
    expect(shouldIdentifyCrossDomainId("ph_from_marketing", undefined)).toBe(true)
  })

  it("does not override an already identified user", () => {
    expect(shouldIdentifyCrossDomainId("ph_from_marketing", "user_1")).toBe(false)
  })
})

describe("isFreshAuthUser", () => {
  it("treats accounts created in the last two minutes as new", () => {
    const now = Date.parse("2026-08-26T16:00:00.000Z")
    expect(isFreshAuthUser("2026-08-26T15:59:00.000Z", now)).toBe(true)
    expect(isFreshAuthUser("2026-08-26T15:50:00.000Z", now)).toBe(false)
  })
})

describe("personPropertiesFromUser", () => {
  it("prefers explicit extras and falls back to metadata", () => {
    expect(
      personPropertiesFromUser(
        {
          email: "meta@example.com",
          user_metadata: { first_name: "Ada", last_name: "Lovelace" },
        },
        { email: "ada@example.com" },
      ),
    ).toEqual({
      email: "ada@example.com",
      name: "Ada Lovelace",
    })
  })
})

describe("amountBucket", () => {
  it("buckets amounts without storing exact values", () => {
    expect(amountBucket(5)).toBe("under_10")
    expect(amountBucket(50)).toBe("10_to_100")
    expect(amountBucket(500)).toBe("100_to_1000")
    expect(amountBucket(5000)).toBe("1000_to_10000")
  })
})

describe("corridor", () => {
  it("builds uppercase currency pair", () => {
    expect(corridor("usd", "ngn")).toBe("USD_NGN")
  })
})
