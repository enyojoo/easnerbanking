import { buildYcSendMappingFromRecipient } from "@easner/shared"
import { listYellowcardNetworks } from "@/lib/yellowcard/networks"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"

export type YcSendRecipientMapping = {
  destination: Record<string, unknown>
  root?: Record<string, unknown>
}

/**
 * Map Easner recipient row → YC send destination + root-level LatAm fields.
 * Bank: accountNumber + accountBank / networkId.
 * MoMo: phoneNumber + networkId from YC networks.
 */
export async function mapRecipientToYcSend(
  row: RecipientSellPrepareRow & { metadata?: Record<string, unknown> | null },
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
      const active = networks.filter((n) => String(n.status ?? "").toLowerCase() !== "inactive")
      if (isMomo) {
        const needle = mobileProvider.toLowerCase()
        const match = active.find((n) => {
          const label = `${n.name ?? ""} ${n.code ?? ""} ${n.networkId ?? ""}`.toLowerCase()
          return needle ? label.includes(needle) : true
        })
        networkId = String(match?.id ?? match?.networkId ?? match?.code ?? "").trim() || undefined
      } else if (bankName) {
        const needle = bankName.toLowerCase()
        const match = active.find((n) => {
          const label = `${n.name ?? ""} ${n.code ?? ""}`.toLowerCase()
          return label.includes(needle) || needle.includes(String(n.code ?? "").toLowerCase())
        })
        networkId = String(match?.id ?? match?.networkId ?? match?.code ?? "").trim() || undefined
      }
    } catch {
      // best-effort network resolution
    }
  }

  return buildYcSendMappingFromRecipient(row, { networkId })
}
