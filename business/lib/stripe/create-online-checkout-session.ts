import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { isBusinessTier1Complete } from "@/lib/compliance/business-tier1"
import { computeCheckoutAmounts, type CheckoutAmounts } from "./application-fee"
import { resolveCheckoutFeeMode } from "./checkout-fee-mode"
import { buildCheckoutSessionMetadata, type OnlineCheckoutSource } from "./checkout-session-metadata"
import { getStripe } from "./client"
import { resolveConnectReadyForCheckout } from "./connect"
import { resolveOnlinePaymentsEnabled } from "./resolve-online-payments-enabled"
import {
  getStripePublishableKey,
  isOnlineCheckoutEnabled,
  isStripeInvoicePaymentsEnabled,
} from "./config"

export type { OnlineCheckoutSource }

export type CreateOnlineCheckoutSessionInput = {
  source: OnlineCheckoutSource
  businessId: string
  mode: "payment" | "subscription"
  /** Amount the merchant listed; the customer charge is derived from the fee mode. */
  listedAmountCents: number
  currency: string
  /** Shown on the payment sheet — never includes provider names. */
  productName: string
  productDescription?: string | null
  customerEmail?: string | null
  statementSuffix?: string | null
  /** Required for `ui_mode: elements`. */
  returnUrl: string
  invoiceId?: string | null
  invoiceNumber?: string | null
  paymentLinkId?: string | null
  /** Recurring links: Price created on the platform account. */
  stripePriceId?: string | null
  trialDays?: number | null
  metadata?: Record<string, string>
  idempotencyKey?: string
  /** False for merchant test keys. Defaults to live. */
  livemode?: boolean
}

export type CreateOnlineCheckoutSessionResult =
  | {
      ok: true
      clientSecret: string
      publishableKey: string
      checkoutSessionId: string
      settlementId: string
      amounts: CheckoutAmounts
    }
  | { ok: false; status: number; error: string }

/** Invoice keeps its own session table until the backfill into online_checkout_sessions lands. */
function sessionTableFor(source: OnlineCheckoutSource): string {
  return source === "invoice" ? "invoice_checkout_sessions" : "online_checkout_sessions"
}

/**
 * One Stripe session creator for every Collections surface (invoice Pay online,
 * Payment Links, website embed).
 *
 * Always a Connect destination charge with no `on_behalf_of`, so Easner stays
 * merchant of record, and always `application_fee_amount` sized by the business's
 * effective fee mode (except when Easner absorbs processing).
 */
export async function createOnlineCheckoutSession(
  admin: SupabaseClient,
  input: CreateOnlineCheckoutSessionInput,
): Promise<CreateOnlineCheckoutSessionResult> {
  const railEnabled =
    input.source === "invoice" ? isStripeInvoicePaymentsEnabled() : isOnlineCheckoutEnabled()
  if (!railEnabled) {
    return { ok: false, status: 503, error: "Online payments are not enabled" }
  }

  const listedAmountCents = Math.round(input.listedAmountCents)
  if (!(listedAmountCents > 0)) {
    return { ok: false, status: 400, error: "Amount must be greater than zero" }
  }

  const currency = String(input.currency || "USD").trim().toLowerCase()
  if (!currency) {
    return { ok: false, status: 400, error: "Currency is required" }
  }

  if (input.mode === "subscription" && !input.stripePriceId) {
    return { ok: false, status: 400, error: "Recurring checkout requires a price" }
  }

  const { data: biz } = await admin
    .from("businesses")
    .select("name, verification_status, verification_provider, grid_customer_id")
    .eq("id", input.businessId)
    .maybeSingle()

  if (!isBusinessTier1Complete(biz)) {
    return {
      ok: false,
      status: 403,
      error: "Business verification is required before accepting online payments",
    }
  }

  const { enabled: onlinePaymentsEnabled } = await resolveOnlinePaymentsEnabled(admin, input.businessId)
  if (!onlinePaymentsEnabled) {
    return {
      ok: false,
      status: 403,
      error: "Online payments are turned off in Settings",
    }
  }

  const connect = await resolveConnectReadyForCheckout(admin, input.businessId, {
    currency: currency.toUpperCase(),
  })
  if (!connect.ready || !connect.stripeAccountId) {
    return {
      ok: false,
      status: 403,
      error: connect.reason || "Complete online payment setup in Settings",
    }
  }
  const connectedAccountId = connect.stripeAccountId

  const { feeMode } = await resolveCheckoutFeeMode(admin, input.businessId)
  const amounts = computeCheckoutAmounts({ listedAmountCents, feeMode })

  const settlementId = randomUUID()
  const livemode = input.livemode !== false
  const idempotencyKey =
    input.idempotencyKey || `checkout_${input.source}_${settlementId}`
  const table = sessionTableFor(input.source)

  const sessionRowPayload: Record<string, unknown> =
    input.source === "invoice"
      ? {
          invoice_id: input.invoiceId,
          business_id: input.businessId,
          easner_settlement_id: settlementId,
          status: "open",
          gross_cents: amounts.customerAmountCents,
          listed_amount_cents: amounts.listedAmountCents,
          application_fee_cents: amounts.applicationFeeCents,
          fee_mode: feeMode,
          currency: currency.toUpperCase(),
          customer_email: input.customerEmail || null,
          idempotency_key: idempotencyKey,
          stripe_connected_account_id: connectedAccountId,
        }
      : {
          business_id: input.businessId,
          source: input.source,
          invoice_id: input.invoiceId ?? null,
          payment_link_id: input.paymentLinkId ?? null,
          mode: input.mode,
          status: "open",
          fee_mode: feeMode,
          easner_settlement_id: settlementId,
          idempotency_key: idempotencyKey,
          listed_amount_cents: amounts.listedAmountCents,
          gross_cents: amounts.customerAmountCents,
          application_fee_cents: amounts.applicationFeeCents,
          currency: currency.toUpperCase(),
          customer_email: input.customerEmail || null,
          return_url: input.returnUrl,
          stripe_connected_account_id: connectedAccountId,
          livemode,
        }

  const { data: sessionRow, error: insertErr } = await admin
    .from(table)
    .insert(sessionRowPayload)
    .select("id")
    .single()

  if (insertErr || !sessionRow?.id) {
    return {
      ok: false,
      status: 500,
      error: insertErr?.message || "Failed to create checkout session row",
    }
  }

  const metadata = buildCheckoutSessionMetadata({
    source: input.source,
    settlementId,
    businessId: input.businessId,
    connectedAccountId,
    feeMode,
    listedAmountCents: amounts.listedAmountCents,
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    paymentLinkId: input.paymentLinkId,
    extra: {
      easner_livemode: livemode ? "true" : "false",
      ...(input.metadata ?? {}),
    },
  })

  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem =
    input.mode === "subscription"
      ? { quantity: 1, price: String(input.stripePriceId) }
      : {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amounts.customerAmountCents,
            product_data: {
              name: input.productName,
              ...(input.productDescription?.trim()
                ? { description: input.productDescription.trim() }
                : {}),
            },
          },
        }

  try {
    const session = await getStripe().checkout.sessions.create(
      {
        ui_mode: "elements",
        mode: input.mode,
        customer_email: input.customerEmail?.trim() || undefined,
        billing_address_collection: "auto",
        line_items: [lineItem],
        metadata,
        return_url: input.returnUrl,
        ...(input.mode === "subscription"
          ? {
              subscription_data: {
                metadata,
                transfer_data: { destination: connectedAccountId },
                ...(amounts.applicationFeePercent > 0
                  ? { application_fee_percent: amounts.applicationFeePercent }
                  : {}),
                ...(input.trialDays && input.trialDays > 0
                  ? { trial_period_days: input.trialDays }
                  : {}),
              },
            }
          : {
              payment_intent_data: {
                metadata,
                transfer_data: { destination: connectedAccountId },
                ...(amounts.applicationFeeCents > 0
                  ? { application_fee_amount: amounts.applicationFeeCents }
                  : {}),
                ...(input.statementSuffix?.trim()
                  ? { statement_descriptor_suffix: input.statementSuffix.trim() }
                  : {}),
              },
            }),
      },
      { idempotencyKey },
    )

    if (!session.client_secret) {
      await admin.from(table).update({ status: "failed" }).eq("id", sessionRow.id)
      return { ok: false, status: 500, error: "Checkout session is missing a client secret" }
    }

    await admin
      .from(table)
      .update({
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
        stripe_connected_account_id: connectedAccountId,
      })
      .eq("id", sessionRow.id)

    return {
      ok: true,
      clientSecret: session.client_secret,
      publishableKey: getStripePublishableKey(),
      checkoutSessionId: session.id,
      settlementId,
      amounts,
    }
  } catch (e) {
    await admin.from(table).update({ status: "failed" }).eq("id", sessionRow.id)
    const msg = e instanceof Error ? e.message : "Failed to create checkout session"
    return { ok: false, status: 500, error: msg }
  }
}
