import { describe, expect, it } from "vitest"
import { buildCheckoutSdkScript, CHECKOUT_SDK_VERSION } from "./build-sdk-script"

const BUILD_INPUT = {
  fallbackStripeKey: "pk_test_platform",
  configUrl: "https://business.easner.com/api/v1/checkout/embed-config",
  defaultAppearance: { theme: "stripe" as const, variables: { colorPrimary: "#0080cc" } },
  methodsHint: "Pay with card, bank debit, or other methods available.",
}

describe("buildCheckoutSdkScript", () => {
  it("produces syntactically valid JavaScript", () => {
    const script = buildCheckoutSdkScript(BUILD_INPUT)
    // Throws on a syntax error without executing the body.
    expect(() => new Function(script)).not.toThrow()
  })

  it("injects the version, fallback key, and config endpoint", () => {
    const script = buildCheckoutSdkScript(BUILD_INPUT)
    expect(script).toContain(JSON.stringify(CHECKOUT_SDK_VERSION))
    expect(script).toContain('"pk_test_platform"')
    expect(script).toContain(BUILD_INPUT.configUrl)
  })

  it("exposes mount and open and never uses innerHTML wipes", () => {
    const script = buildCheckoutSdkScript(BUILD_INPUT)
    expect(script).toContain("window.EasnerCheckout")
    expect(script).toContain("mount: function")
    expect(script).toContain("open: openOverlay")
    expect(script).not.toContain("innerHTML")
  })

  it("validates the merchant key against the config endpoint and supports wallets", () => {
    const script = buildCheckoutSdkScript(BUILD_INPUT)
    expect(script).toContain("fetchEmbedConfig")
    expect(script).toContain("createExpressCheckoutElement")
    expect(script).toContain('redirect = "if_required"')
  })
})
