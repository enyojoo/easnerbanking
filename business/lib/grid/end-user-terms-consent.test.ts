import { describe, expect, it } from "vitest"
import {
  buildEndUserTermsConsentPayload,
  customerNeedsEndUserTermsConsentPatch,
  inferAcceptanceMethod,
  shouldRefreshGridTermsAcceptance,
} from "./end-user-terms-consent"

describe("shouldRefreshGridTermsAcceptance", () => {
  it("refreshes for brand-new users", () => {
    expect(shouldRefreshGridTermsAcceptance(null, "v1")).toBe(true)
    expect(shouldRefreshGridTermsAcceptance({}, "v1")).toBe(true)
  })

  it("refreshes when version missing or mismatched", () => {
    expect(
      shouldRefreshGridTermsAcceptance(
        {
          id: "u1",
          grid_end_user_terms_version: null,
          grid_end_user_terms_accepted_at: "2026-01-01T00:00:00Z",
        },
        "v2",
      ),
    ).toBe(true)
    expect(
      shouldRefreshGridTermsAcceptance(
        {
          id: "u1",
          grid_end_user_terms_version: "v1",
          grid_end_user_terms_accepted_at: "2026-01-01T00:00:00Z",
        },
        "v2",
      ),
    ).toBe(true)
  })

  it("skips when version matches and accepted_at present", () => {
    expect(
      shouldRefreshGridTermsAcceptance(
        {
          id: "u1",
          grid_end_user_terms_version: "v2",
          grid_end_user_terms_accepted_at: "2026-01-01T00:00:00Z",
        },
        "v2",
      ),
    ).toBe(false)
  })
})

describe("buildEndUserTermsConsentPayload", () => {
  it("returns null when required fields missing", () => {
    expect(buildEndUserTermsConsentPayload(null)).toBeNull()
    expect(
      buildEndUserTermsConsentPayload({
        grid_end_user_terms_version: "v1",
        grid_end_user_terms_accepted_at: "2026-01-01T00:00:00Z",
      }),
    ).toBeNull()
  })

  it("maps audit row to Grid API shape with CLICK_TO_ACCEPT", () => {
    expect(
      buildEndUserTermsConsentPayload({
        grid_end_user_terms_version: "2025-10-01",
        grid_end_user_terms_accepted_at: "2026-08-12T10:00:00.000Z",
        grid_end_user_terms_accept_ip: "203.0.113.10",
        grid_end_user_terms_accept_method: "signup_email",
      }),
    ).toEqual({
      acceptanceMethod: "CLICK_TO_ACCEPT",
      acceptedAt: "2026-08-12T10:00:00.000Z",
      ipAddress: "203.0.113.10",
      termsVersion: "2025-10-01",
    })
  })
})

describe("inferAcceptanceMethod", () => {
  it("infers signup/login + provider", () => {
    expect(inferAcceptanceMethod(true, [{ provider: "email" } as never])).toBe("signup_email")
    expect(inferAcceptanceMethod(false, [{ provider: "apple" } as never])).toBe("login_apple")
    expect(inferAcceptanceMethod(true, [{ provider: "google" } as never])).toBe("signup_google")
  })
})

describe("customerNeedsEndUserTermsConsentPatch", () => {
  const consent = {
    acceptanceMethod: "CLICK_TO_ACCEPT" as const,
    acceptedAt: "2026-08-12T10:00:00.000Z",
    ipAddress: "203.0.113.10",
    termsVersion: "v2",
  }

  it("patches when missing or stale", () => {
    expect(customerNeedsEndUserTermsConsentPatch(null, consent)).toBe(true)
    expect(customerNeedsEndUserTermsConsentPatch({}, consent)).toBe(true)
    expect(
      customerNeedsEndUserTermsConsentPatch(
        { endUserTermsConsent: { termsVersion: "v1" } },
        consent,
      ),
    ).toBe(true)
  })

  it("skips when versions match", () => {
    expect(
      customerNeedsEndUserTermsConsentPatch(
        { endUserTermsConsent: { termsVersion: "v2" } },
        consent,
      ),
    ).toBe(false)
  })
})
