import type Stripe from "stripe"
import { connectedAccountRequest } from "./connect-request"
import {
  parsePaymentMethodDisplayFromCharge,
  parsePaymentMethodDisplayFromPaymentMethod,
} from "@/lib/stripe/parse-payment-method-display"
import type { StripePaymentMethodDisplay } from "@/lib/stripe/parse-payment-method-display"

export type ResolvedChargeSettlement = {
  /** Stripe processing on the platform charge (`balance_transaction.fee`). */
  feeCents: number
  /**
   * Connect application fee kept by the platform. `0` when Easner absorbs.
   * Null when Stripe did not set `application_fee_amount` on the PaymentIntent.
   */
  applicationFeeCents: number | null
  chargeId: string | null
  /** Charge.created as ISO – the paid-at Stripe receipts use. */
  chargedAt: string | null
  paymentMethodType: string | null
  paymentMethod: StripePaymentMethodDisplay | null
  transferId: string | null
  connectedAccountId: string | null
  /** From charge/PM billing details or PaymentIntent.receipt_email. */
  payerEmail: string | null
  payerName: string | null
}

export function paymentMethodIsComplete(pm: StripePaymentMethodDisplay | null): boolean {
  if (!pm?.type) return false
  if (pm.type === "card") return Boolean(pm.brand || pm.last4)
  if (pm.type === "us_bank_account" || pm.type === "ach_debit" || pm.type === "ach") {
    return Boolean(pm.bankName || pm.last4)
  }
  return true
}

function trimmedNonEmpty(value: unknown): string | null {
  if (typeof value !== "string") return null
  const s = value.trim()
  return s ? s : null
}

function emailFromUnknown(value: unknown): string | null {
  const s = trimmedNonEmpty(value)
  return s && s.includes("@") ? s : null
}

/** Session webhooks carry email; PI.succeeded usually does not – fall back to the charge. */
export function payerIdentityFromPaymentIntent(pi: Stripe.PaymentIntent): {
  payerEmail: string | null
  payerName: string | null
} {
  const charge =
    typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null
  const pm =
    typeof pi.payment_method === "object" && pi.payment_method ? pi.payment_method : null
  const payerEmail =
    emailFromUnknown(pi.receipt_email) ||
    emailFromUnknown(charge && "billing_details" in charge ? charge.billing_details?.email : null) ||
    emailFromUnknown(pm && "billing_details" in pm ? pm.billing_details?.email : null)
  const payerName =
    trimmedNonEmpty(charge && "billing_details" in charge ? charge.billing_details?.name : null) ||
    trimmedNonEmpty(pm && "billing_details" in pm ? pm.billing_details?.name : null)
  return { payerEmail, payerName }
}

function inferPaymentMethodTypeFromSession(types: string[] | null | undefined): string | null {
  if (!Array.isArray(types) || types.length === 0) return null
  const normalized = types.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
  if (normalized.length === 1) return normalized[0]
  // When multiple types are enabled, prefer bank debit over card for incomplete captures.
  if (normalized.includes("us_bank_account")) return "us_bank_account"
  return normalized[0] ?? null
}

/**
 * Processing fee, charge, payment method, and connected account for a payment intent.
 * Shared by invoice and checkout (Payment Links / embed) settlement handlers.
 */
export async function resolveFeeAndTransfer(
  stripe: Stripe,
  paymentIntentId: string,
  opts?: { sessionPaymentMethodTypes?: string[] | null; stripeAccount?: string | null },
): Promise<ResolvedChargeSettlement> {
  try {
    const pi = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      {
        expand: ["latest_charge.balance_transaction", "latest_charge.transfer", "payment_method"],
      },
      connectedAccountRequest(opts?.stripeAccount),
    )
    const charge =
      typeof pi.latest_charge === "object" && pi.latest_charge ? pi.latest_charge : null
    const chargeId =
      charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : null)
    const bt =
      charge && typeof charge.balance_transaction === "object" && charge.balance_transaction
        ? charge.balance_transaction
        : null
    const feeCents = bt && typeof bt.fee === "number" ? bt.fee : 0
    const applicationFeeCents =
      typeof pi.application_fee_amount === "number" ? pi.application_fee_amount : null

    let paymentMethod = parsePaymentMethodDisplayFromCharge(charge)
    let paymentMethodType =
      paymentMethod?.type ??
      (charge && typeof charge.payment_method_details?.type === "string"
        ? charge.payment_method_details.type
        : null)

    if (!paymentMethod) {
      const pmObj =
        typeof pi.payment_method === "object" && pi.payment_method ? pi.payment_method : null
      paymentMethod = parsePaymentMethodDisplayFromPaymentMethod(pmObj)
      paymentMethodType = paymentMethod?.type ?? paymentMethodType
    }

    if (!paymentMethodType) {
      paymentMethodType = inferPaymentMethodTypeFromSession(opts?.sessionPaymentMethodTypes)
      if (paymentMethodType && !paymentMethod) {
        paymentMethod = { type: paymentMethodType }
      }
    }

    let transferId: string | null = null
    if (charge && typeof charge.transfer === "string") {
      transferId = charge.transfer
    } else if (charge && typeof charge.transfer === "object" && charge.transfer) {
      transferId = charge.transfer.id
    }

    const connectedFromPi =
      typeof pi.transfer_data?.destination === "string"
        ? pi.transfer_data.destination
        : pi.transfer_data?.destination && typeof pi.transfer_data.destination === "object"
          ? pi.transfer_data.destination.id
          : null

    const connectedFromMeta =
      String(pi.metadata?.easner_stripe_connected_account_id ?? "").trim() || null

    const chargedAt =
      charge && typeof charge.created === "number"
        ? new Date(charge.created * 1000).toISOString()
        : typeof pi.created === "number"
          ? new Date(pi.created * 1000).toISOString()
          : null

    const { payerEmail, payerName } = payerIdentityFromPaymentIntent(pi)

    return {
      feeCents,
      applicationFeeCents,
      chargeId,
      chargedAt,
      paymentMethodType,
      paymentMethod,
      transferId,
      connectedAccountId: String(opts?.stripeAccount ?? "").trim() || connectedFromMeta || connectedFromPi,
      payerEmail,
      payerName,
    }
  } catch (e) {
    console.warn("[stripe] fee resolve failed:", e)
    return {
      feeCents: 0,
      applicationFeeCents: null,
      chargeId: null,
      chargedAt: null,
      paymentMethodType: null,
      paymentMethod: null,
      transferId: null,
      connectedAccountId: null,
      payerEmail: null,
      payerName: null,
    }
  }
}
