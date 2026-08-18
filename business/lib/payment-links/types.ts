import { PAYMENT_LINK_PUBLIC_ID_PREFIX } from "./public-id"

export type PaymentLinkRail = "card_bank" | "stablecoin"
export type PaymentLinkMode = "one_time" | "subscription"
export type PaymentLinkInterval = "month" | "year"

export type PaymentLink = {
  id: string
  publicId: string
  slug: string
  label: string
  description: string | null
  amountCents: number
  currency: string
  rail: PaymentLinkRail
  mode: PaymentLinkMode
  billingInterval: PaymentLinkInterval | null
  trialDays: number | null
  redirectUrl: string | null
  autopayoutConfigId: string | null
  paymentCount: number
  archivedAt: string | null
  createdAt: string
}

const RAILS: readonly PaymentLinkRail[] = ["card_bank", "stablecoin"]
const MODES: readonly PaymentLinkMode[] = ["one_time", "subscription"]
const INTERVALS: readonly PaymentLinkInterval[] = ["month", "year"]

export function parsePaymentLinkRail(raw: unknown): PaymentLinkRail | null {
  const value = String(raw ?? "").trim().toLowerCase()
  return RAILS.includes(value as PaymentLinkRail) ? (value as PaymentLinkRail) : null
}

export function parsePaymentLinkMode(raw: unknown): PaymentLinkMode | null {
  const value = String(raw ?? "").trim().toLowerCase()
  return MODES.includes(value as PaymentLinkMode) ? (value as PaymentLinkMode) : null
}

export function parsePaymentLinkInterval(raw: unknown): PaymentLinkInterval | null {
  const value = String(raw ?? "").trim().toLowerCase()
  return INTERVALS.includes(value as PaymentLinkInterval) ? (value as PaymentLinkInterval) : null
}

export function mapRowToPaymentLink(row: Record<string, unknown>): PaymentLink {
  const id = String(row.id)
  return {
    id,
    publicId:
      typeof row.public_id === "string" && row.public_id
        ? row.public_id
        : `${PAYMENT_LINK_PUBLIC_ID_PREFIX}${id.replace(/-/g, "")}`,
    slug: String(row.slug ?? ""),
    label: String(row.label ?? ""),
    description: typeof row.description === "string" && row.description ? row.description : null,
    amountCents: Number(row.amount_cents ?? 0),
    currency: String(row.currency ?? "USD").toUpperCase(),
    rail: parsePaymentLinkRail(row.rail) ?? "card_bank",
    mode: parsePaymentLinkMode(row.mode) ?? "one_time",
    billingInterval: parsePaymentLinkInterval(row.billing_interval),
    trialDays: row.trial_days == null ? null : Number(row.trial_days),
    redirectUrl: typeof row.redirect_url === "string" && row.redirect_url ? row.redirect_url : null,
    autopayoutConfigId:
      typeof row.autopayout_config_id === "string" ? row.autopayout_config_id : null,
    paymentCount: Number(row.payment_count ?? 0),
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    createdAt: String(row.created_at ?? ""),
  }
}

/** Plain-language type for tables and share sheets — no provider names. */
export function paymentLinkTypeLabel(link: Pick<PaymentLink, "rail" | "mode" | "billingInterval">): string {
  if (link.rail === "stablecoin") return "Stablecoin"
  if (link.mode === "subscription") {
    return link.billingInterval === "year" ? "Recurring — yearly" : "Recurring — monthly"
  }
  return "One-time"
}

/** Customer-facing renewal disclosure for recurring links. */
export function recurringDisclosure(
  link: Pick<PaymentLink, "billingInterval" | "trialDays">,
  formattedAmount: string,
): string {
  const every = link.billingInterval === "year" ? "year" : "month"
  const trial =
    link.trialDays && link.trialDays > 0
      ? ` Your first ${link.trialDays} days are free, then billing starts.`
      : ""
  return `${formattedAmount} will be charged every ${every} until you cancel.${trial} You can cancel any time by contacting the business.`
}
