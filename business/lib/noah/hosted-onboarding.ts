/**
 * Noah Hosted Onboarding – POST /v1/onboarding/:CustomerID
 * Request body must include full `ReturnURL` (https) per Noah; see `getReturnUrlForNoahScope` / config.
 * Noah Standard Model: one HostedURL covers KYC/KYB verification and Terms & Conditions acceptance.
 * @see https://docs.noah.com/recipes/onboarding/hosted-onboarding/
 *
 * Token Share (Sumsub prefill) uses POST /v1/onboarding/:CustomerID/prefill before hosted session:
 * @see https://docs.noah.com/recipes/onboarding/token-share-onboarding/
 */

import { getNoahReturnUrl, getNoahBusinessReturnUrl } from "./config"
import type { NoahCustomerScope } from "./customer-id"

export type HostedOnboardingCustomerType = "Individual" | "Business"

export type HostedOnboardingBody = {
  ReturnURL: string
  FiatOptions: Array<{ FiatCurrencyCode: string }>
  CustomerType: HostedOnboardingCustomerType
  Metadata: Record<string, string>
}

export function getReturnUrlForNoahScope(scope: NoahCustomerScope): string {
  return scope === "business" ? getNoahBusinessReturnUrl() : getNoahReturnUrl()
}

export function buildHostedOnboardingBody(opts: {
  scope: NoahCustomerScope
  customerType: HostedOnboardingCustomerType
  metadata?: Record<string, string>
  fiatOptions?: Array<{ FiatCurrencyCode: string }>
}): HostedOnboardingBody {
  return {
    ReturnURL: getReturnUrlForNoahScope(opts.scope),
    FiatOptions: opts.fiatOptions ?? [{ FiatCurrencyCode: "USD" }, { FiatCurrencyCode: "EUR" }],
    CustomerType: opts.customerType,
    Metadata: opts.metadata ?? {},
  }
}
