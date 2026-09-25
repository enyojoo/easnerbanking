import { parsePayoutProviderId } from "./corridor-surface-routing"
import {
  resolveOfficePayInProvider,
  type PayoutProviderId,
} from "./payout-corridor"
import { findUsUsdBankCorridor } from "./us-pay-in-mode"

export type BusinessDepositKybProduct = "us_banking" | "euro_banking"

export type BusinessDepositKybGate = {
  complete: boolean
  product: BusinessDepositKybProduct
}

/**
 * Office pay-in for a business ledger. USD defaults to Grid; EUR defaults to Bridge.
 * If Office sets US pay-in to Bridge, USD uses More accounts KYB.
 * With default Grid US pay-in, Bridge-only KYB still unlocks USD via the Bridge VA.
 */
export function resolveBusinessLedgerPayInProvider(
  rows:
    | Array<{
        country_code?: string
        currency_code?: string
        rail?: string
        metadata?: unknown
      }>
    | null
    | undefined,
  currency: string,
): PayoutProviderId | null {
  const cur = String(currency ?? "").trim().toUpperCase()
  if (cur === "USD") {
    const row = findUsUsdBankCorridor(rows)
    const fromRow =
      parsePayoutProviderId((row?.metadata as { pay_in_provider?: unknown } | undefined)?.pay_in_provider) ??
      resolveOfficePayInProvider(row?.metadata, "business")
    return fromRow ?? "grid"
  }
  if (cur === "EUR") {
    const eur =
      (rows ?? []).find(
        (row) =>
          String(row.currency_code ?? "").trim().toUpperCase() === "EUR" &&
          (row.rail == null || row.rail === "bank_transfer"),
      ) ?? null
    const fromRow =
      parsePayoutProviderId((eur?.metadata as { pay_in_provider?: unknown } | undefined)?.pay_in_provider) ??
      resolveOfficePayInProvider(eur?.metadata, "business")
    return fromRow ?? "bridge"
  }
  return null
}

/**
 * Whether this currency’s bank deposit is unlocked, and which hub product the CTA should open.
 *
 * USD under default Office Grid routing unlocks when Grid **or** Bridge KYB is approved so
 * Bridge-only orgs can use the Bridge USD VA already in `virtual_accounts`. Explicit Office
 * `pay_in_provider: bridge` still gates USD on Bridge alone.
 */
export function resolveBusinessDepositKyb(input: {
  currency: string
  officePayIn: string | null | undefined
  gridApproved: boolean
  bridgeApproved: boolean
}): BusinessDepositKybGate {
  const cur = String(input.currency ?? "").trim().toUpperCase()
  const payIn = String(input.officePayIn ?? "").trim().toLowerCase()

  if (cur === "EUR") {
    return { complete: input.bridgeApproved, product: "euro_banking" }
  }

  if (cur === "USD") {
    if (payIn === "bridge") {
      return { complete: input.bridgeApproved, product: "euro_banking" }
    }
    if (input.gridApproved) {
      return { complete: true, product: "us_banking" }
    }
    if (input.bridgeApproved) {
      return { complete: true, product: "euro_banking" }
    }
    return { complete: false, product: "us_banking" }
  }

  return {
    complete: input.gridApproved || input.bridgeApproved,
    product: "us_banking",
  }
}

export const BUSINESS_DEPOSIT_KYB_COPY = {
  us_banking: {
    title: "Complete Global banking to get this account",
    body: "Verify Global banking to receive deposit details for this account.",
    cta: "Begin verification",
    inReviewTitle: "Global banking is in review",
    inReviewBody: "We’re checking the information you submitted. This usually completes within 1–3 business days.",
    rejectedBody:
      "Global banking could not be completed. Review it to receive deposit details for this account.",
  },
  euro_banking: {
    title: "Add more accounts to get this account",
    body: "Add more accounts to receive deposit details for this account.",
    cta: "Begin verification",
    inReviewTitle: "More accounts is in review",
    inReviewBody: "We’re checking the information you submitted. This usually completes within 1–3 business days.",
    rejectedBody:
      "More accounts could not be completed. Review it to receive deposit details for this account.",
  },
} as const
