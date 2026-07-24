import { yellowcardFetch } from "./http"
import { requireDepositOmnibusSolanaAddressUsd } from "@/lib/deposit-omnibus/config"
import { getYellowcardEnvironment } from "./config"
import { normalizeYcMomoPhone, resolveYcPaymentReason } from "@easner/shared"

export type YcReceiveRail = "bank_transfer" | "mobile_money"

export type YcReceiveSource = {
  accountType: "bank" | "momo"
  accountNumber?: string
  networkId?: string
}

export type YcReceiveSubmitInput = {
  sequenceId: string
  customerUID: string
  /** Always retail for NG business (owner person). */
  customerType?: "retail" | "institution"
  channelId: string
  currency: string
  country: string
  localAmount?: number
  amount?: number
  forceAccept?: boolean
  directSettlement?: boolean
  /** @deprecated Receive uses `recipient`, not `sender`. */
  sender?: Record<string, unknown>
  /** Customer KYC for receive (required for direct settlement). */
  recipient?: Record<string, unknown>
  /** Payer bank/momo source (required for direct settlement). */
  source?: YcReceiveSource
  /** Build source from rail when `source` omitted. */
  payInRail?: YcReceiveRail
  /** MoMo phone when rail is mobile_money (production). */
  sourcePhone?: string | null
  /** MoMo network id from YC Get Networks (required for production MoMo pay-in). */
  sourceNetworkId?: string | null
  settlementWalletAddress?: string
  reason?: string
}

export type YcReceiveSubmitResult = {
  id?: string
  sequenceId?: string
  status?: string
  rate?: number
  convertedAmount?: number
  localAmount?: number
  networkFeeAmountUSD?: number
  serviceFeeAmountUSD?: number
  bankInfo?: Record<string, unknown>
  settlementInfo?: {
    cryptoAmount?: number
    walletAddress?: string
    cryptoCurrency?: string
    cryptoNetwork?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** YC `/receive` requires `source.accountType` (bank | momo). */
export function buildYcReceiveSource(input: {
  rail: YcReceiveRail
  phone?: string | null
  networkId?: string | null
  country?: string | null
}): YcReceiveSource {
  const accountType = input.rail === "mobile_money" ? "momo" : "bank"
  const source: YcReceiveSource = { accountType }
  const phone = String(input.phone ?? "").trim()
  const networkId = String(input.networkId ?? "").trim()
  const country = String(input.country ?? "").trim().toUpperCase()
  const normalizedPhone = phone && country ? normalizeYcMomoPhone(phone, country) : phone
  if (getYellowcardEnvironment() === "sandbox") {
    const sandboxDigits = phone || "1111111111"
    source.accountNumber =
      country && sandboxDigits
        ? normalizeYcMomoPhone(sandboxDigits, country)
        : "1111111111"
    if (accountType === "momo" && networkId) {
      source.networkId = networkId
    }
  } else if (accountType === "momo") {
    if (normalizedPhone) source.accountNumber = normalizedPhone
    if (networkId) source.networkId = networkId
  }
  return source
}

export function buildYcReceiveSubmitBody(input: YcReceiveSubmitInput): Record<string, unknown> {
  const wallet =
    input.settlementWalletAddress?.trim() || requireDepositOmnibusSolanaAddressUsd()

  const body: Record<string, unknown> = {
    sequenceId: input.sequenceId,
    customerUID: input.customerUID,
    customerType: input.customerType ?? "retail",
    channelId: input.channelId,
    currency: input.currency.toUpperCase(),
    country: input.country.toUpperCase(),
    forceAccept: input.forceAccept ?? true,
    directSettlement: input.directSettlement ?? true,
    settlementInfo: {
      walletAddress: wallet,
      cryptoCurrency: "USDC",
      cryptoNetwork: "SOL",
    },
  }
  if (input.localAmount != null) body.localAmount = input.localAmount
  if (input.amount != null) body.amount = input.amount
  const recipient = input.recipient ?? input.sender
  if (recipient) body.recipient = recipient
  const source =
    input.source ??
    (input.payInRail
      ? buildYcReceiveSource({
          rail: input.payInRail,
          phone: input.sourcePhone,
          networkId: input.sourceNetworkId,
          country: input.country,
        })
      : null)
  if (source) body.source = source
  body.reason = resolveYcPaymentReason(input.reason)
  return body
}

/** YC docs use `bankInfo.name` for the deposit bank / processor (e.g. PAGA). */
const BANK_NAME_KEYS = [
  "name",
  "bankName",
  "bank_name",
  "bank",
  "institutionName",
  "institution_name",
  "partnerName",
  "partner_name",
  "processorName",
  "processor_name",
] as const

export function resolveYcBankInfoName(
  bankInfo: Record<string, unknown> | null | undefined,
): string {
  if (!bankInfo || typeof bankInfo !== "object") return ""
  for (const key of BANK_NAME_KEYS) {
    const value = String(bankInfo[key] ?? "").trim()
    if (value) return value
  }
  return ""
}

/**
 * Normalize bankInfo for UI: prefer `bankName` when YC only returns `name`
 * (Yellowcard Lookup Collection example: `{ name: "PAGA", accountNumber, accountName }`).
 * Keep a single bank-name field — UI also dedupes aliases.
 */
export function normalizeYcBankInfo(
  bankInfo: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!bankInfo || typeof bankInfo !== "object") return null
  const out: Record<string, unknown> = { ...bankInfo }
  const bankName = resolveYcBankInfoName(out)
  if (bankName) {
    out.bankName = bankName
    // Drop YC `name` alias once mirrored — prevents duplicate Bank Name rows.
    if ("name" in out && String(out.name ?? "").trim() === bankName) {
      delete out.name
    }
  }
  return out
}

/**
 * POST /receive sometimes omits `bankInfo.name` for NG bank VAs.
 * Re-fetch GET /receive/{id} when bank name is missing so pay-in UI can show Bank Name.
 */
export async function hydrateYcReceiveBankInfo(
  receive: YcReceiveSubmitResult,
): Promise<YcReceiveSubmitResult> {
  const existing = normalizeYcBankInfo(
    (receive.bankInfo as Record<string, unknown> | null | undefined) ?? null,
  )
  if (resolveYcBankInfoName(existing)) {
    return { ...receive, bankInfo: existing ?? undefined }
  }

  const ycId = String(receive.id ?? "").trim()
  const sequenceId = String(receive.sequenceId ?? "").trim()
  if (!ycId && !sequenceId) {
    return { ...receive, bankInfo: existing ?? receive.bankInfo }
  }

  try {
    const path = ycId
      ? `/receive/${encodeURIComponent(ycId)}`
      : `/receive/sequence-id/${encodeURIComponent(sequenceId)}`
    const lookedUp = await yellowcardFetch<YcReceiveSubmitResult>({
      method: "GET",
      path,
    })
    const lookedUpBank = normalizeYcBankInfo(
      (lookedUp.bankInfo as Record<string, unknown> | null | undefined) ?? null,
    )
    if (!resolveYcBankInfoName(lookedUpBank) && !lookedUpBank) {
      return { ...receive, bankInfo: existing ?? receive.bankInfo }
    }
    const merged = normalizeYcBankInfo({
      ...(existing ?? {}),
      ...(lookedUpBank ?? {}),
    })
    return {
      ...receive,
      ...(!receive.id && lookedUp.id ? { id: lookedUp.id } : {}),
      bankInfo: merged ?? existing ?? receive.bankInfo,
    }
  } catch {
    return { ...receive, bankInfo: existing ?? receive.bankInfo }
  }
}

export async function submitYcReceive(
  input: YcReceiveSubmitInput,
): Promise<YcReceiveSubmitResult> {
  const body = buildYcReceiveSubmitBody(input)
  const created = await yellowcardFetch<YcReceiveSubmitResult>({
    method: "POST",
    path: "/receive",
    json: body,
  })
  return hydrateYcReceiveBankInfo(created)
}
