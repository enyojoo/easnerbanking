import {
  applyProviderBindingToRecipient,
  buildYcSendMappingFromRecipient,
  pickYcSendNetworkId,
  resolveCorridorBankName,
  resolveCorridorMomoProvider,
  resolveYcRecipientCountry,
} from "@easner/shared"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export type YcSendRecipientMapping = {
  destination: Record<string, unknown>
  root?: Record<string, unknown>
}

/**
 * Map Easner recipient row → YC send destination + root-level LatAm fields.
 * Bank: accountNumber + accountBank + networkId (specific bank or Manual Input).
 * MoMo: E.164 accountNumber + networkId from YC networks.
 */
export async function mapRecipientToYcSend(
  row: RecipientSellPrepareRow & { metadata?: Record<string, unknown> | null },
  opts?: { channelId?: string | null },
): Promise<YcSendRecipientMapping> {
  const boundRow = applyProviderBindingToRecipient(row, "yellowcard")
  const country = resolveYcRecipientCountry(boundRow)
  const currency = String(boundRow.currency ?? "").trim().toUpperCase()
  const mobileProvider = String(boundRow.mobile_provider ?? "").trim()
  const bankName = String(boundRow.bank_name ?? "").trim()
  const accountNumber = String(boundRow.account_number ?? "").trim()
  const phone = String(boundRow.phone_number ?? "").trim()

  const isMomo =
    Boolean(mobileProvider) ||
    bankName.toLowerCase().includes("mobile money") ||
    Boolean(phone && !accountNumber)

  let networkId: string | undefined
  let branchCode: string | undefined
  let resolvedBankName = bankName
  let resolvedMobileProvider = mobileProvider
  if (isMomo || (country && currency)) {
    try {
      const networks = await listYellowcardNetworks({ country, currency })
      const networkNames = networks
        .map((n) => String(n.name ?? n.code ?? "").trim())
        .filter(Boolean)
      if (!isMomo && bankName) {
        resolvedBankName = resolveCorridorBankName(bankName, networkNames)
      }
      if (isMomo && mobileProvider) {
        resolvedMobileProvider = resolveCorridorMomoProvider(
          mobileProvider,
          networkNames.map((name) => ({ value: name, label: name })),
        )
      }
      networkId = pickYcSendNetworkId({
        networks,
        channelId: opts?.channelId,
        bankName: resolvedBankName,
        mobileProvider: resolvedMobileProvider,
        isMomo,
        fallbackToFirst: country === "BR" && !isMomo,
      })
      const matched = networkId
        ? networks.find((n) => String(n.id ?? n.networkId ?? "").trim() === networkId)
        : undefined
      const networkCode = String(matched?.code ?? "").trim()
      // ZA Instant EFT uses the network `code` as the universal branch code.
      if (country === "ZA" && /^\d{4,8}$/.test(networkCode)) {
        branchCode = networkCode
      }
    } catch {
      // best-effort network resolution
    }
  }

  const mappedRow = {
    ...boundRow,
    ...(resolvedBankName ? { bank_name: resolvedBankName } : {}),
    ...(resolvedMobileProvider ? { mobile_provider: resolvedMobileProvider } : {}),
  }

  return buildYcSendMappingFromRecipient(mappedRow, { networkId, branchCode })
}
