import { buildYcSendMappingFromRecipient, pickYcSendNetworkId } from "@easner/shared"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export type YcSendRecipientMapping = {
  destination: Record<string, unknown>
  root?: Record<string, unknown>
}

/**
 * Map Easner recipient row → YC send destination + root-level LatAm fields.
 * Bank: accountNumber + accountBank + networkId (specific bank or Manual Input).
 * MoMo: phoneNumber + networkId from YC networks.
 */
export async function mapRecipientToYcSend(
  row: RecipientSellPrepareRow & { metadata?: Record<string, unknown> | null },
  opts?: { channelId?: string | null },
): Promise<YcSendRecipientMapping> {
  const country = String(row.country_code ?? "").trim().toUpperCase()
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
  if (isMomo || (country && currency)) {
    try {
      const networks = await listYellowcardNetworks({ country, currency })
      networkId = pickYcSendNetworkId({
        networks,
        channelId: opts?.channelId,
        bankName,
        mobileProvider,
        isMomo,
      })
    } catch {
      // best-effort network resolution
    }
  }

  return buildYcSendMappingFromRecipient(row, { networkId })
}
