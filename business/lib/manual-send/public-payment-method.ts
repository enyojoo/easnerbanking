import { parseStablecoinInstructions } from "@/lib/manual-send/payment-method-instructions"

export type PublicPaymentMethodSummary = {
  id: string
  currency: string
  name: string
  type: string
  is_default: boolean
  display_logo_url?: string | null
}

export type PublicPaymentMethodDetail = PublicPaymentMethodSummary & {
  account_name?: string | null
  account_number?: string | null
  bank_name?: string | null
  routing_number?: string | null
  sort_code?: string | null
  iban?: string | null
  swift_bic?: string | null
  mobile_money_provider?: string | null
  phone_number?: string | null
  qr_code_data?: string | null
  stablecoin?: {
    wallet_address?: string
    network?: string
    memo?: string
  }
  completion_timer_seconds?: number | null
}

function rowActive(status: unknown): boolean {
  return String(status ?? "active").toLowerCase() === "active"
}

export function toPublicPaymentMethodSummary(row: Record<string, unknown>): PublicPaymentMethodSummary {
  const logo = row.display_logo_url
  return {
    id: String(row.id ?? ""),
    currency: String(row.currency ?? "").toUpperCase(),
    name: String(row.name ?? ""),
    type: String(row.type ?? ""),
    is_default: Boolean(row.is_default),
    display_logo_url:
      typeof logo === "string" && logo.trim() ? logo.trim() : null,
  }
}

export function toPublicPaymentMethodDetail(row: Record<string, unknown>): PublicPaymentMethodDetail {
  const type = String(row.type ?? "")
  const base = toPublicPaymentMethodSummary(row)
  const detail: PublicPaymentMethodDetail = {
    ...base,
    account_name: (row.account_name as string) ?? null,
    account_number: (row.account_number as string) ?? null,
    bank_name: (row.bank_name as string) ?? null,
    routing_number: (row.routing_number as string) ?? null,
    sort_code: (row.sort_code as string) ?? null,
    iban: (row.iban as string) ?? null,
    swift_bic: (row.swift_bic as string) ?? null,
    mobile_money_provider: (row.mobile_money_provider as string) ?? null,
    phone_number: (row.phone_number as string) ?? null,
    qr_code_data: (row.qr_code_data as string) ?? null,
    completion_timer_seconds:
      row.completion_timer_seconds == null ? null : Number(row.completion_timer_seconds),
  }
  if (type === "stablecoin") {
    const sc = parseStablecoinInstructions(row.instructions as string | undefined)
    const wallet =
      sc.wallet_address ||
      (typeof row.account_number === "string" ? row.account_number : undefined)
    detail.stablecoin = {
      wallet_address: wallet,
      network: sc.network || (typeof row.mobile_money_provider === "string" ? row.mobile_money_provider : undefined),
      memo: sc.memo,
    }
  }
  return detail
}

export function filterActivePaymentMethodRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((r) => rowActive(r.status))
}
