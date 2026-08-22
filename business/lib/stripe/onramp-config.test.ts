import { afterEach, describe, expect, it } from "vitest"
import { getStripeLinkOAuthScopes } from "./onramp-config"

describe("getStripeLinkOAuthScopes", () => {
  const prev = process.env.STRIPE_LINK_OAUTH_SCOPES

  afterEach(() => {
    if (prev == null) delete process.env.STRIPE_LINK_OAUTH_SCOPES
    else process.env.STRIPE_LINK_OAUTH_SCOPES = prev
  })

  it("uses comma-separated official Link scopes", () => {
    delete process.env.STRIPE_LINK_OAUTH_SCOPES
    expect(getStripeLinkOAuthScopes()).toBe(
      "kyc.status:read,crypto:ramp,auth.persist_login:read",
    )
  })

  it("rewrites the old space-separated crypto_onramp value", () => {
    process.env.STRIPE_LINK_OAUTH_SCOPES = "crypto_onramp auth.persist_login:read"
    expect(getStripeLinkOAuthScopes()).toBe(
      "crypto:ramp,auth.persist_login:read,kyc.status:read",
    )
  })
})
