import { EXPRESS_DEPOSITS_COPY } from "@easner/shared"

export function mapStripeOnrampError(code: string | null | undefined, fallback?: string): string {
  const c = String(code || "").toLowerCase()
  if (c.includes("missing_minimum_identity")) return EXPRESS_DEPOSITS_COPY.setupRequiredHint
  if (c.includes("missing_identity") || c.includes("missing_nationalities")) {
    return EXPRESS_DEPOSITS_COPY.continueCta
  }
  if (c.includes("missing_document") || c.includes("identity")) return EXPRESS_DEPOSITS_COPY.identityHint
  if (c.includes("missing_eu") || c.includes("identifier")) return EXPRESS_DEPOSITS_COPY.identifierHint
  if (c.includes("expired") || c.includes("quote")) return "This quote expired. Check the amount and try again."
  if (c.includes("abandon") || c.includes("canceled") || c.includes("cancelled")) {
    return EXPRESS_DEPOSITS_COPY.paymentFailed
  }
  if (c.includes("scope") || c.includes("oauth") || c.includes("crypto") || c.includes("onramp")) {
    return EXPRESS_DEPOSITS_COPY.somethingWentWrong
  }
  return fallback || EXPRESS_DEPOSITS_COPY.somethingWentWrong
}
