import {
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
  const country = resolveYcRecipientCountry(row)
  const currency = String(row.currency ?? "").trim().toUpperCase()
  const mobileProvider = String(row.mobile_provider ?? "").trim()
  const bankName = String(row.bank_name ?? "").trim()
  const accountNumber = String(row.account_number ?? "").trim()
  const phone = String(row.phone_number ?? "").trim()

  const isMomo =
    Boolean(mobileProvider) ||
    bankName.toLowerCase().includes("mobile money") ||
    Boolean(phone && !accountNumber)

  let networkId: string | undefined
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
      })
    } catch {
      // best-effort network resolution
    }
  }

  const mappedRow = {
    ...row,
    ...(resolvedBankName ? { bank_name: resolvedBankName } : {}),
    ...(resolvedMobileProvider ? { mobile_provider: resolvedMobileProvider } : {}),
  }

  return buildYcSendMappingFromRecipient(mappedRow, { networkId })
}
